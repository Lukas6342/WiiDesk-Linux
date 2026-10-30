
// What the "Yes" button of the confirmation dialog does (return to menu or log out)
var pendingAction = null;

function confirmYes() {
    if (pendingAction) pendingAction();
}

function openConfirmDialog(text, action) {
    document.getElementById('confirmText').innerHTML = text;
    pendingAction = action;
    $(".returndialog").css("display", "flex");
    playSFX('button-select-big.mp3', userConfig.sfxVol);
}

window.addEventListener("load", () => {
    document.body.insertAdjacentHTML("beforeend", `
        <div class="home-menu">
            <div class="bar-top close-pause-menu">
                <span>HOME Menu</span>
                <img src="assets/home-close.png" />
            </div>
            <div class="in-between">
                <a class="buttonlike backtomenu" onmouseenter="playSFX('button-hover.mp3', userConfig.sfxVol)">Wii Menu</a>
                <a class="buttonlike logout" onmouseenter="playSFX('button-hover.mp3', userConfig.sfxVol)">Log Out</a>
            </div>
            <div class="bar-bottom">
                <img src="assets/remote.png" class="remote" />
                <div>
                    <div class="battery">
                        <div>
                            <span>P1</span>
                            <img src="assets/power-full.png" />
                        </div>
                        <div>
                            <span>P2</span>
                            <img src="assets/power-empty.png" />
                        </div>
                        <div>
                            <span>P3</span>
                            <img src="assets/power-empty.png" />
                        </div>
                        <div>
                            <span>P4</span>
                            <img src="assets/power-empty.png" />
                        </div>
                    </div>
                    <div class="text">Wii Remote Settings</div>
                </div>
            </div>
        </div>
        <div class="returndialog">
            <div class="msgbox">
                <div class="text" id="confirmText">
                    Return to the Wii Menu?<br>
                    (Anything not saved will be lost.)
                </div>
                <div class="actions">
                    <a onclick="confirmYes();" onmouseenter="playSFX('button-hover.mp3', userConfig.sfxVol)">Yes</a>
                    <a class="closedialog" onmouseenter="playSFX('button-hover.mp3', userConfig.sfxVol)" onclick="playSFX('button-cancel.mp3', userConfig.sfxVol)">No</a>
                </div>
            </div>
        </div>
    `);

    var lastBgMusicState;
    // True when the Home key opened the menu on top of another app
    var openedOverApp = false;

    function openHomeMenu() {
        lastBgMusicState = getBGMusicState();

        if (getBGMusicState().intro) bgMusicIntroToggle();

        if (getBGMusicState().main) bgMusicToggle();
        playSFX('home-in.mp3', userConfig.sfxVol);
        $(".home-menu").css("display", "grid");
        $('.home-menu')[0].ariaLabel = 'on';
    }

    function closeHomeMenu() {
        $(".home-menu").addClass("fadeOut");
        setTimeout(() => {
            $(".home-menu").css("display", "none");
            $(".home-menu").removeClass("fadeOut");
        }, 250);
        playSFX('button-cancel.mp3', userConfig.sfxVol);

        if (lastBgMusicState && lastBgMusicState.intro) bgMusicIntroToggle();

        if (lastBgMusicState && lastBgMusicState.main) bgMusicToggle();
        $('.home-menu')[0].ariaLabel = null;

        // Desktop app: go back to the app the menu was opened over
        if (window.electronIpc) window.electronIpc.invoke('home-closed', openedOverApp);
        openedOverApp = false;
    }

    function toggleHomeMenu() {
        if ($('.home-menu')[0].ariaLabel !== 'on') openHomeMenu();
        else closeHomeMenu();
    }

    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 27 || e.key === 'Escape') {
            e.preventDefault();
            toggleHomeMenu();
        }
    });

    // Home key (Super), forwarded by the desktop session
    if (window.electronIpc) {
        window.electronIpc.on('home-button', function(event, overApp) {
            if ($('.home-menu')[0].ariaLabel !== 'on') openedOverApp = !!overApp;
            toggleHomeMenu();
        });
    }

    $(".close-pause-menu").click(closeHomeMenu);

    $(".backtomenu").click(event => {
        openConfirmDialog('Return to the Wii Menu?<br>(Anything not saved will be lost.)', rm2);
    });

    // Logging out only makes sense inside the desktop app
    if (!window.electronIpc) $(".logout").hide();

    $(".logout").click(event => {
        openConfirmDialog('Log out of WiiDesk?<br>(Anything not saved will be lost.)', logOut);
    });

    $(".closedialog").click(event => {
        $(".returndialog").css("display", "none");
    });
});