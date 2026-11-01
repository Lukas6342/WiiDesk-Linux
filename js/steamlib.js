// Steam library view (opened from the Shop channel): owned games with Install / Start.
// The work is done by steam.js in the main process.

var steamGames = [];

function openSteamLibrary() {
    showSettingsView('steamView');
    $(".settings").stop(true, true).fadeIn(400);
    $(".grid").stop(true, true).fadeOut();
    steamLoad();
}

(function () {
    function el(id) { return document.getElementById(id); }
    function note(text) { el('steamNote').textContent = text || ''; }

    function render() {
        var grid = el('steamGrid');
        var q = el('steamSearch').value.trim().toLowerCase();
        grid.textContent = '';
        steamGames.filter(function (g) { return !q || g.name.toLowerCase().indexOf(q) !== -1; }).forEach(function (g) {
            var card = document.createElement('a');
            card.className = 'steam-card' + (g.installed ? ' installed' : '');
            var img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = '';
            img.src = 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + g.appid + '/header.jpg';
            img.onerror = function () { img.style.visibility = 'hidden'; };
            var name = document.createElement('span');
            name.className = 'steam-name';
            name.textContent = g.name;
            var state = document.createElement('span');
            state.className = 'steam-state';
            state.textContent = g.installed ? 'Start' : 'Install';
            card.appendChild(img);
            card.appendChild(name);
            card.appendChild(state);
            card.addEventListener('mouseenter', function () { playSFX('button-hover.mp3', userConfig.sfxVol); });
            card.addEventListener('click', function () { act(g); });
            grid.appendChild(card);
        });
    }

    function act(g) {
        playSFX('button-select-big.mp3', userConfig.sfxVol);
        note(g.installed ? 'Starting ' + g.name + '…' : 'Opening Steam to install ' + g.name + '… Confirm the download there.');
        window.electronIpc.invoke('steam-action', g.installed ? 'start' : 'install', g.appid).then(function (r) {
            if (!r.ok) note("Couldn't reach Steam" + (r.error ? ' (' + r.error + ')' : '') + '.');
        });
    }

    window.steamLoad = function () {
        if (!window.electronIpc) return;
        note('Loading your library…');
        el('steamGrid').textContent = '';
        window.electronIpc.invoke('steam-library').then(function (r) {
            if (!r.ok) { steamGames = []; note(r.error || "Couldn't load the library."); return; }
            steamGames = r.games;
            // Library could not be read: offer the API key as the reliable way
            el('steamKeyRow').style.display = r.needKey ? 'flex' : 'none';
            note(r.note || (r.games.length ? '' : 'No games found.'));
            render();
        });
    };

    document.addEventListener('DOMContentLoaded', function () {
        el('steamSearch').addEventListener('input', render);
        el('steamKeySave').addEventListener('click', function () {
            playSFX('button-select.mp3', userConfig.sfxVol);
            window.electronIpc.invoke('steam-set-key', el('steamKey').value).then(function (r) {
                if (!r.ok) { note(r.error || "Couldn't save the key."); return; }
                el('steamKey').value = '';
                steamLoad();
            });
        });
        el('steamKey').addEventListener('keydown', function (e) { if (e.key !== 'Escape') e.stopPropagation(); });
        el('steamRefresh').addEventListener('click', function () { playSFX('button-select.mp3', userConfig.sfxVol); steamLoad(); });
        // typing must not trigger menu shortcuts
        el('steamSearch').addEventListener('keydown', function (e) { if (e.key !== 'Escape') e.stopPropagation(); });
    });
})();
