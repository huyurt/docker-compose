(function (window, undefined) {
    let isInit = false;
    let api = null;

    function loadScript(src, callback) {
        if (window.JitsiMeetExternalAPI) {
            callback();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = callback;
        script.onerror = function () {
            console.error("Failed to load external_api.js from " + src);
            // fallback to public meet.jit.si if local fails
            if (!src.includes('meet.jit.si')) {
                loadScript('https://meet.jit.si/external_api.js', callback);
            }
        };
        document.head.appendChild(script);
    }

    window.Asc.plugin.init = function (data) {
        // Pre-fill from plugin data or editor user info if available
        if (data && typeof data === 'object') {
            if (data.domain) document.getElementById("inp_domain").value = data.domain;
            if (data.roomName) document.getElementById("inp_room").value = data.roomName;
            if (data.userName) document.getElementById("inp_user").value = data.userName;
            if (data.jwt) document.getElementById("inp_jwt").value = data.jwt;
        }

        const startBtn = document.getElementById("btn_start");
        const stopBtn = document.getElementById("btn_stop");
        const meetContainer = document.getElementById("meet");
        const setupPanel = document.getElementById("setup-panel");
        const activePanel = document.getElementById("active-panel");
        const errDiv = document.getElementById("div_err");

        startBtn.onclick = function () {
            if (isInit) return;

            const domain = document.getElementById("inp_domain").value.trim();
            const roomName = document.getElementById("inp_room").value.trim();
            const userName = document.getElementById("inp_user").value.trim();
            const jwt = document.getElementById("inp_jwt").value.trim();

            if (!roomName) {
                errDiv.classList.remove("hidden");
                return;
            }
            errDiv.classList.add("hidden");

            const apiUrl = (domain.startsWith("http://") || domain.startsWith("https://"))
                ? `${domain}/external_api.js`
                : `https://${domain}/external_api.js`;

            const cleanDomain = domain.replace(/^https?:\/\//, '');

            loadScript(apiUrl, function () {
                setupPanel.classList.add("hidden");
                activePanel.classList.remove("hidden");
                meetContainer.classList.remove("hidden");

                const options = {
                    roomName: roomName,
                    width: '100%',
                    height: '100%',
                    parentNode: meetContainer,
                    interfaceConfigOverwrite: {
                        SHOW_CHROME_EXTENSION_BANNER: false,
                        TOOLBAR_BUTTONS: [
                            'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
                            'fodeviceselection', 'hangup', 'chat', 'raisehand',
                            'videoquality', 'filmstrip', 'tileview'
                        ]
                    },
                    userInfo: {
                        displayName: userName || 'OnlyOffice User'
                    }
                };

                if (jwt) {
                    options.jwt = jwt;
                }

                try {
                    api = new window.JitsiMeetExternalAPI(cleanDomain, options);
                    isInit = true;

                    api.addEventListeners({
                        videoConferenceLeft: function () {
                            stopCall();
                        }
                    });
                } catch (e) {
                    console.error("Jitsi Init Error:", e);
                    stopCall();
                    alert("Jitsi başlatılamadı: " + e.message);
                }
            });
        };

        function stopCall() {
            if (api) {
                try {
                    api.dispose();
                } catch (e) { }
                api = null;
            }
            isInit = false;
            meetContainer.innerHTML = "";
            meetContainer.classList.add("hidden");
            activePanel.classList.add("hidden");
            setupPanel.classList.remove("hidden");
        }

        stopBtn.onclick = stopCall;
    };

    window.Asc.plugin.button = function (id) {
        this.executeCommand("close", "");
    };

})(window, undefined);
