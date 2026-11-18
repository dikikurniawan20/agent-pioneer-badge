// Agent Pioneer Badge — front-end logic.
// Read-only calls go through the public node; the mint goes through the
// user's own injected wallet and is always confirmed by the user.
// This site never asks for a seed phrase, private key, or password.
(function () {
  "use strict";
  var C = window.BADGE_CONFIG;
  var ZERO = "0x0000000000000000000000000000000000000000";

  var AGENT_ID_ABI = ["function balanceOf(address owner) view returns (uint256)"];
  var BADGE_ABI = [
    "function mint()",
    "function isEligible(address account) view returns (bool)",
    "function hasMinted(address account) view returns (bool)",
    "function totalMinted() view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function tierName(uint256 tokenId) view returns (string)",
    "function MAX_SUPPLY() view returns (uint256)",
    "event BadgeMinted(address indexed minter, uint256 indexed tokenId, string tier)"
  ];

  var statusEl = document.getElementById("status");
  var connectBtn = document.getElementById("connectBtn");
  var mintBtn = document.getElementById("mintBtn");
  var txInfoEl = document.getElementById("txInfo");
  var mintedCountEl = document.getElementById("mintedCount");
  var contractAddrEl = document.getElementById("contractAddr");
  var wallEl = document.getElementById("wall");

  var provider = null; // ethers BrowserProvider (user wallet)
  var signer = null;
  var account = null;
  var readProvider = null; // public read-only node
  var badgeRead = null;

  function setStatus(msg) { statusEl.textContent = msg; }
  function short(addr) { return addr.slice(0, 6) + "..." + addr.slice(-4); }

  function badgeDeployed() {
    return C.BADGE_ADDRESS && C.BADGE_ADDRESS.toLowerCase() !== ZERO;
  }

  function init() {
    contractAddrEl.textContent = badgeDeployed() ? C.BADGE_ADDRESS : "not deployed yet";
    try {
      readProvider = new ethers.JsonRpcProvider(C.RPC_URL);
      if (badgeDeployed()) {
        badgeRead = new ethers.Contract(C.BADGE_ADDRESS, BADGE_ABI, readProvider);
      }
    } catch (e) {
      console.warn("read provider unavailable", e);
    }
    refreshMintedCount();
    loadWall();
    connectBtn.addEventListener("click", connect);
    mintBtn.addEventListener("click", mint);
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", function (accs) {
        account = accs.length ? accs[0] : null;
        signer = null;
        refreshStatus();
      });
      window.ethereum.on("chainChanged", function () { window.location.reload(); });
    }
  }

  async function refreshMintedCount() {
    if (!badgeRead) { mintedCountEl.textContent = "—"; return; }
    try {
      var n = await badgeRead.totalMinted();
      mintedCountEl.textContent = n.toString();
    } catch (e) { mintedCountEl.textContent = "—"; }
  }

  async function connect() {
    if (!window.ethereum) {
      setStatus("No injected wallet found. Install a wallet that injects a provider, then reload this page.");
      return;
    }
    try {
      provider = new ethers.BrowserProvider(window.ethereum);
      var accs = await provider.send("eth_requestAccounts", []);
      account = accs[0];
      signer = await provider.getSigner();
      var net = await provider.getNetwork();
      if (Number(net.chainId) !== C.CHAIN_ID) {
        setStatus("Your wallet is on the wrong network. Please switch it to " + C.CHAIN_NAME + ".");
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x" + C.CHAIN_ID.toString(16) }]
          });
          return connect();
        } catch (e) {
          setStatus("Could not switch networks automatically. Please switch your wallet to " + C.CHAIN_NAME + " manually, then reload.");
          return;
        }
      }
      connectBtn.textContent = "Connected: " + short(account);
      connectBtn.disabled = true;
      await refreshStatus();
    } catch (e) {
      setStatus("Connection failed: " + (e && e.message ? e.message : e));
    }
  }

  async function refreshStatus() {
    if (!account) { setStatus("Not connected."); mintBtn.disabled = true; return; }
    if (!badgeDeployed()) {
      setStatus("Connected as " + short(account) + ". The badge contract is not deployed yet — check back soon.");
      mintBtn.disabled = true;
      return;
    }
    try {
      var agentId = new ethers.Contract(C.AGENT_ID_ADDRESS, AGENT_ID_ABI, provider);
      var bal = await agentId.balanceOf(account);
      var badge = new ethers.Contract(C.BADGE_ADDRESS, BADGE_ABI, provider);
      var minted = await badge.hasMinted(account);
      var total = await badge.totalMinted();
      mintedCountEl.textContent = total.toString();
      if (bal === 0n) {
        setStatus("Connected as " + short(account) + ". This wallet holds no Agent ID, so it cannot mint a badge.");
        mintBtn.disabled = true;
      } else if (minted) {
        setStatus("Connected as " + short(account) + ". You already minted your badge — one per wallet. Thank you, pioneer.");
        mintBtn.disabled = true;
      } else {
        setStatus("Connected as " + short(account) + ". You hold an Agent ID and have not minted yet — your badge is free (you pay only the network gas fee).");
        mintBtn.disabled = false;
      }
    } catch (e) {
      setStatus("Could not read your status from the chain: " + (e && e.message ? e.message : e));
      mintBtn.disabled = true;
    }
  }

  async function mint() {
    if (!signer || !account) return;
    mintBtn.disabled = true;
    txInfoEl.textContent = "Waiting for you to confirm in your wallet…";
    try {
      var badge = new ethers.Contract(C.BADGE_ADDRESS, BADGE_ABI, signer);
      var tx = await badge.mint();
      txInfoEl.textContent = "Transaction sent: " + tx.hash + " — waiting for confirmation…";
      var receipt = await tx.wait();
      var tokenId = null;
      try {
        var iface = new ethers.Interface(BADGE_ABI);
        for (var i = 0; i < receipt.logs.length; i++) {
          try {
            var parsed = iface.parseLog(receipt.logs[i]);
            if (parsed && parsed.name === "BadgeMinted") tokenId = parsed.args.tokenId.toString();
          } catch (e) { /* log is from another contract */ }
        }
      } catch (e) { /* ignore */ }
      txInfoEl.textContent = "Minted! " + (tokenId ? "Your badge is #" + tokenId + ". " : "") + "Tx: " + tx.hash;
      await refreshStatus();
      await refreshMintedCount();
      await loadWall();
    } catch (e) {
      txInfoEl.textContent = "Mint failed or was rejected in your wallet: " + (e && e.message ? e.message : e);
      mintBtn.disabled = false;
    }
  }

  function decodeTokenUri(uri) {
    // data:application/json;base64,<b64>
    var prefix = "data:application/json;base64,";
    if (uri.indexOf(prefix) !== 0) return null;
    try {
      var json = JSON.parse(atob(uri.slice(prefix.length)));
      var tier = "";
      if (json.attributes) {
        for (var i = 0; i < json.attributes.length; i++) {
          if (json.attributes[i].trait_type === "Tier") tier = json.attributes[i].value;
        }
      }
      return { name: json.name || "", image: json.image || "", tier: tier };
    } catch (e) { return null; }
  }

  async function loadWall() {
    if (!badgeRead) {
      wallEl.innerHTML = "<p class='muted'>The contract is not deployed yet — the wall will appear after launch.</p>";
      return;
    }
    try {
      var total = Number(await badgeRead.totalMinted());
      if (total === 0) {
        wallEl.innerHTML = "<p class='muted'>No badges minted yet. Be the first.</p>";
        return;
      }
      var from = Math.max(1, total - C.WALL_LIMIT + 1);
      var cards = [];
      for (var id = total; id >= from; id--) {
        try {
          var uri = await badgeRead.tokenURI(id);
          var owner = await badgeRead.ownerOf(id);
          var meta = decodeTokenUri(uri);
          if (!meta) continue;
          cards.push({ id: id, owner: owner, meta: meta });
        } catch (e) { /* skip unreadable token */ }
      }
      if (!cards.length) {
        wallEl.innerHTML = "<p class='muted'>Could not load badges from the chain right now.</p>";
        return;
      }
      wallEl.innerHTML = "";
      cards.forEach(function (c) {
        var div = document.createElement("div");
        div.className = "badge-card";
        var img = document.createElement("img");
        img.src = c.meta.image;
        img.alt = c.meta.name;
        var m = document.createElement("div");
        m.className = "meta";
        var t = document.createElement("div");
        t.className = "tier";
        t.textContent = "#" + c.id + " · " + c.meta.tier;
        var o = document.createElement("div");
        o.className = "muted";
        o.textContent = short(c.owner);
        m.appendChild(t);
        m.appendChild(o);
        div.appendChild(img);
        div.appendChild(m);
        wallEl.appendChild(div);
      });
    } catch (e) {
      wallEl.innerHTML = "<p class='muted'>Could not load the wall right now.</p>";
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
