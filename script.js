// GASのウェブアプリURL (バックエンド)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwFZngodQAmIV5QWtwouxiqli44onOg_N6H641WYHP2eBANZxFeeF98luvu56sw1v9-Yw/exec';

document.addEventListener('DOMContentLoaded', () => {

    // モバイルでの長押しによるコンテキストメニュー（コピー等）を
    // 入力要素以外では出さないようにする
    document.addEventListener('contextmenu', (e) => {
        try {
            if (!e.target.closest || !e.target.closest('input, textarea, select')) {
                e.preventDefault();
            }
        } catch (err) { /* ignore */ }
    }, { passive: false });

    // ----------- HTML要素取得 (ログイン画面用) -----------
    const loginView = document.getElementById('login-view');
    const appView = document.getElementById('app-view');
    const loginBtn = document.getElementById('login-button');
    const loginIdInput = document.getElementById('login-id');
    const loginPassInput = document.getElementById('login-pass');
    const loginMsg = document.getElementById('login-msg');

    // ----------- HTML要素取得 (アプリ本体用) -----------
    const dungeonSelect = document.getElementById('dungeonSelect');
    const floorSelect = document.getElementById('floorSelect');
    const inputA = document.getElementById('inputA');
    const inputB = document.getElementById('inputB');
    const inputC = document.getElementById('inputC');
    const inputL = document.getElementById('inputL');
    const totalReductionRateDisplay = document.getElementById('totalReductionRate');
    const resultsTableBody = document.querySelector('#resultsTable tbody');

    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const AUTO_SCROLL_ON_TAB = false;

    const notificationIcon = document.getElementById('notificationIcon');
    const notificationBadge = document.getElementById('notificationBadge');
    const notificationPopup = document.getElementById('notificationPopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const popupCloseButton = document.getElementById('popupCloseButton');
    const notificationList = document.getElementById('notification-list');

    const linksPopupButton = document.getElementById('external-links-button');
    const linksPopup = document.getElementById('links-popup');
    const linksPopupOverlay = document.getElementById('links-popup-overlay');
    const linksPopupCloseButton = document.getElementById('links-popup-close-button');

    const syncButton = document.getElementById('syncButton'); // ログアウトボタンとして使用

    let damageDungeonData = {};
    let latestNotificationDate = '';
    let damageTabInitialized = false;

    // =========== GAS連携・認証関連処理 ===========

    // GASへのPOST送信ヘルパー
    async function postToGAS(action, payload = {}) {
        const params = {
            method: "POST",
            // CORS対策のため text/plain で送り GAS側で JSON.parse させる
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({ action: action, ...payload })
        };
        try {
            const res = await fetch(GAS_API_URL, params);
            return await res.json();
        } catch (e) {
            console.error(e);
            return { success: false, message: '通信エラーが発生しました' };
        }
    }

    // セッションチェック (起動時)
    async function checkSession() {
        const userId = localStorage.getItem('pazu_user_id');
        const token = localStorage.getItem('pazu_token');

        if (userId && token) {
            try {
                // ハートビート送信 (有効性チェック & 更新)
                const res = await postToGAS('heartbeat', { id: userId, token: token });
                if (res.status === 'ok') {
                    showApp(); // 認証OK
                } else {
                    showLogin('セッションが切れました。再ログインしてください。');
                }
            } catch (e) {
                showLogin('通信エラー。オフラインかサーバーダウンです。');
            }
        } else {
            showLogin();
        }
    }

    // アプリ画面の表示
    function showApp() {
        if (loginView) loginView.classList.add('hidden');
        if (appView) appView.classList.remove('hidden');
        // アプリ表示後に初期化処理を実行
        initializeAll();
    }

    // ログイン画面の表示
    function showLogin(msg = '') {
        if (loginView) loginView.classList.remove('hidden');
        if (appView) appView.classList.add('hidden');
        if (loginMsg && msg) loginMsg.textContent = msg;
    }

    // ログインボタンクリック時の処理
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const id = loginIdInput.value;
            const pass = loginPassInput.value;
            if (!id || !pass) {
                loginMsg.textContent = 'IDとパスワードを入力してください';
                return;
            }

            loginBtn.disabled = true;
            loginMsg.textContent = '認証中...';

            const res = await postToGAS('login', { id: id, pass: pass });
            
            loginBtn.disabled = false;
            if (res.success) {
                // 成功したらトークン保存
                localStorage.setItem('pazu_user_id', id);
                localStorage.setItem('pazu_token', res.token);
                loginMsg.textContent = '';
                showApp();
            } else {
                loginMsg.textContent = res.message || 'ログイン失敗';
            }
        });
    }

    // ログアウトボタン処理 (旧・同期ボタン)
    if (syncButton) {
        syncButton.textContent = '🚪 ログアウト';
        syncButton.addEventListener('click', async () => {
            if(!confirm('ログアウトしますか？')) return;
            
            const userId = localStorage.getItem('pazu_user_id');
            const token = localStorage.getItem('pazu_token');
            
            // GASへログアウト通知
            await postToGAS('logout', { id: userId, token: token });
            
            // ローカル情報を削除してリロード
            localStorage.removeItem('pazu_user_id');
            localStorage.removeItem('pazu_token');
            location.reload();
        });
    }

    // =========== 以下、既存のアプリロジック ===========

    // データ読み込み
    async function fetchData(url) {
        try {
            const response = await fetch(`${url}?t=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`${url}の読み込みに失敗しました。(${response.status})`);
            return await response.json();
        } catch (error) {
            console.error(error);
            return null; // エラー時はnullを返す
        }
    }

    // 背景画像のランダム設定
    async function setRandomBackground() {
        try {
            const backgroundImages = await fetchData('./media-list.json');
            if (!backgroundImages || backgroundImages.length === 0) {
                console.warn('背景画像リストが見つからないか空です。');
                return;
            }
            const randomIndex = Math.floor(Math.random() * backgroundImages.length);
            const selectedImage = backgroundImages[randomIndex];
            document.body.style.backgroundImage = `url('${selectedImage}')`;
        } catch (error) {
            console.error('背景画像の設定に失敗しました:', error);
        }
    }

    // タブ切り替え処理
    function setupTabs() {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetId = tab.dataset.tab;
                tabContents.forEach(tc => {
                    tc.classList.toggle('hidden', tc.id !== targetId);
                });

                if (targetId === 'damage' && !damageTabInitialized) setupDamageTab();
                
                const showContent = document.getElementById(targetId);
                if (showContent && AUTO_SCROLL_ON_TAB) scrollContentIntoView(showContent);
            });
        });
    }

    // スクロールヘルパー
    function scrollContentIntoView(el) {
        try {
            const headerBar = document.querySelector('.notification-sync-bar');
            const headerHeight = headerBar ? headerBar.getBoundingClientRect().height + 12 : 12;
            const rect = el.getBoundingClientRect();
            const absoluteTop = window.pageYOffset + rect.top - headerHeight;
            window.scrollTo({ top: absoluteTop, behavior: 'smooth' });
        } catch (e) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ダメージ計算タブ初期化
    function setupDamageTab() {
        if (damageTabInitialized) return;
        [dungeonSelect, floorSelect, inputA, inputB, inputC, inputL].forEach(el => {
            if(el) {
                el.addEventListener('change', runDamageCalculation);
                if (el.tagName === 'INPUT') el.addEventListener('input', runDamageCalculation);
            }
        });
        runDamageCalculation();
        damageTabInitialized = true;
    }

    // 計算処理
    function runDamageCalculation() {
        if (!dungeonSelect || !floorSelect) return;
        
        const selectedDungeon = dungeonSelect.value;
        const selectedFloor = floorSelect.value;
        resultsTableBody.innerHTML = ''; 

        if (!selectedDungeon || !selectedFloor) {
            totalReductionRateDisplay.textContent = ''; 
            return;
        }

        const valA = parseFloat(inputA.value) || 0;
        const valB = parseFloat(inputB.value) || 0;
        const valC = parseFloat(inputC.value) || 0;
        const valL = parseInt(inputL.value) || 0;

        const leaderReduce = 1 - valA;
        const friendReduce = 1 - valB;
        const skillReduce = 1 - valC;
        const lReduce = 1 - 0.05 * valL;
        const totalReduce = Math.max(0, leaderReduce * friendReduce * skillReduce * lReduce);
        totalReductionRateDisplay.textContent = `総軽減率: ${((1 - totalReduce) * 100).toFixed(2)}%`;

        if (damageDungeonData && damageDungeonData[selectedDungeon]) {
            const damageData = damageDungeonData[selectedDungeon][selectedFloor];
            const damageRatios = typeof damageData === 'string'
                ? damageData.split(',').map(s => parseFloat(s.replace('%', '')))
                : (Array.isArray(damageData) ? damageData : []);

            damageRatios.forEach(ratio => {
                if (isNaN(ratio)) return; 
                const finalDamagePercent = (ratio * totalReduce).toFixed(2);
                const canSurvive = finalDamagePercent < 100;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${ratio}%</td>
                    <td>${finalDamagePercent}%</td>
                    <td class="${canSurvive ? 'can-withstand' : 'cannot-withstand'}">${canSurvive ? '耐えられる' : '耐えられない'}</td>
                `;
                resultsTableBody.appendChild(tr);
            });
        }
    }

    function parseNumberFromString(value, fallback = NaN) {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'number') return value;
        const s = String(value).replace(/,/g, '').replace(/[^\d.\-]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? fallback : n;
    }

    // ポップアップと外部リンクボタン処理
    function setupPopupsAndSync() {
        if(notificationIcon) {
            notificationIcon.addEventListener('click', () => {
                notificationPopup.classList.remove('hidden');
                notificationBadge.classList.add('hidden');
                notificationIcon.classList.remove('active');
                if (latestNotificationDate) {
                    localStorage.setItem('lastReadNotificationDate', latestNotificationDate);
                }
            });
        }
        if(popupOverlay) popupOverlay.addEventListener('click', () => notificationPopup.classList.add('hidden'));
        if(popupCloseButton) popupCloseButton.addEventListener('click', () => notificationPopup.classList.add('hidden'));

        if (linksPopupButton && linksPopup) {
            linksPopupButton.addEventListener('click', () => linksPopup.classList.remove('hidden'));
        }
        if (linksPopupOverlay && linksPopup) {
            linksPopupOverlay.addEventListener('click', () => linksPopup.classList.add('hidden'));
        }
        if (linksPopupCloseButton && linksPopup) {
            linksPopupCloseButton.addEventListener('click', () => linksPopup.classList.add('hidden'));
        }

        // ※旧syncButtonのロジックはここで設定せず、上のログアウト処理部分で設定済み
    }

    // お知らせ取得
    async function fetchAndShowNotifications() {
        try {
            const notifications = await fetchData('./announcements.json');
            if (!notifications || !Array.isArray(notifications)) {
                if(notificationList) notificationList.innerHTML = '<p>お知らせの読み込みに失敗しました。</p>';
                return;
            }
            if(notificationList) notificationList.innerHTML = '';
            
            if (notifications.length > 0) {
                latestNotificationDate = notifications[0].date;
                const lastReadDate = localStorage.getItem('lastReadNotificationDate');
                let unreadCount = 0;

                notifications.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'notification-item';
                    div.innerHTML = `<strong>${item.date}</strong><p>${item.content}</p>`;
                    if(notificationList) notificationList.appendChild(div);
                    if (!lastReadDate || item.date > lastReadDate) unreadCount++;
                });

                if(notificationBadge) {
                    notificationBadge.classList.toggle('hidden', unreadCount === 0);
                    if (unreadCount > 0) notificationBadge.textContent = unreadCount;
                }
                if(notificationIcon) notificationIcon.classList.toggle('active', unreadCount > 0);
            } else {
                if(notificationList) notificationList.innerHTML = '<p>新しいお知らせはありません。</p>';
                if(notificationBadge) notificationBadge.classList.add('hidden');
                if(notificationIcon) notificationIcon.classList.remove('active');
            }
        } catch (error) {
            console.error('お知らせ取得エラー:', error);
            if(notificationList) notificationList.innerHTML = '<p>お知らせの読み込みに失敗しました。</p>';
        }
    }

    // ----------- 初期化処理 (ログイン後に呼ばれる) -----------
    async function initializeAll() {
        // 重複実行防止
        if (window.appInitialized) return;
        window.appInitialized = true;

        await setRandomBackground();
        damageDungeonData = await fetchData('./dungeonData.json');

        // プルダウンの初期化関数
        function initializeSelectWithOptions(selectElement, placeholderText, data) {
            if (!selectElement) return;
            selectElement.innerHTML = `<option value="">${placeholderText}</option>`;
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(name => selectElement.add(new Option(name, name)));
                selectElement.disabled = false;
            } else {
                selectElement.disabled = true;
            }
        }

        function initializeSelect(selectElement, placeholderText) {
            if (!selectElement) return;
            selectElement.innerHTML = `<option value="">${placeholderText}</option>`;
            selectElement.disabled = true;
        }

        // ダメージ計算タブのプルダウン初期化
        initializeSelectWithOptions(dungeonSelect, 'ダンジョンを選択してください', damageDungeonData);
        initializeSelect(floorSelect, 'フロアを選択してください');

        // ダンジョン選択時のイベントリスナー
        if (dungeonSelect) {
            dungeonSelect.addEventListener('change', () => {
                const selectedDungeon = dungeonSelect.value;
                initializeSelect(floorSelect, 'フロアを選択してください');
                if (selectedDungeon && damageDungeonData && damageDungeonData[selectedDungeon]) {
                    Object.keys(damageDungeonData[selectedDungeon]).forEach(name => floorSelect.add(new Option(name, name)));
                    floorSelect.disabled = false;
                } else {
                    floorSelect.disabled = true;
                }
                runDamageCalculation();
            });
        }

        setupTabs();
        setupPopupsAndSync();

        // タブ復元ロジック
        const lastTab = localStorage.getItem('lastActiveTab');
        let initialTab = null;
        if (lastTab) {
            initialTab = document.querySelector(`.tab-button[data-tab="${lastTab}"]`);
        }
        if (!initialTab) {
            initialTab = document.querySelector('.tab-button');
        }
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
        if (initialTab) {
            document.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
            initialTab.classList.add('active');
            const targetId = initialTab.dataset.tab;
            const showContent = document.getElementById(targetId);
            if (showContent) showContent.classList.remove('hidden');
            if (targetId === 'damage' && !damageTabInitialized) setupDamageTab();
        }
        localStorage.removeItem('lastActiveTab');

        fetchAndShowNotifications();
    }

    // 起動時にまずセッションを確認する
    checkSession();
});
