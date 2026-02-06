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

    // ----------- HTML要素取得 -----------
    const dungeonSelect = document.getElementById('dungeonSelect');
    const floorSelect = document.getElementById('floorSelect');
    const inputA = document.getElementById('inputA');
    const inputB = document.getElementById('inputB');
    const inputC = document.getElementById('inputC');
    const inputL = document.getElementById('inputL');
    const totalReductionRateDisplay = document.getElementById('totalReductionRate');
    const resultsTableBody = document.querySelector('#resultsTable tbody');

    // 経験値/HP関連の要素は削除されました

    const tabs = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    // タブ選択で自動スクロールするかどうか（false にして自動スクロールを無効化）
    const AUTO_SCROLL_ON_TAB = false;

    const notificationIcon = document.getElementById('notificationIcon');
    const notificationBadge = document.getElementById('notificationBadge');
    const notificationPopup = document.getElementById('notificationPopup');
    const popupOverlay = document.getElementById('popupOverlay');
    const popupCloseButton = document.getElementById('popupCloseButton');
    const notificationList = document.getElementById('notification-list');

    // 存在しない場合もあるのでnull許容で取得
    const linksPopupButton = document.getElementById('external-links-button');
    const linksPopup = document.getElementById('links-popup');
    const linksPopupOverlay = document.getElementById('links-popup-overlay');
    const linksPopupCloseButton = document.getElementById('links-popup-close-button');

    const syncButton = document.getElementById('syncButton');

    let damageDungeonData = {};
    let latestNotificationDate = '';

    let damageTabInitialized = false;

    // ----------- データ読み込み -----------
    async function fetchData(url) {
        try {
            const response = await fetch(`${url}?t=${new Date().getTime()}`);
            if (!response.ok) throw new Error(`${url}の読み込みに失敗しました。(${response.status})`);
            return await response.json();
        } catch (error) {
            console.error(error);
            // alert(error.message); // エラー表示は開発時以外コメントアウト推奨
            return null; // エラー時はnullを返す
        }
    }

    // ----------- 背景画像のランダム設定 -----------
    async function setRandomBackground() {
        try {
            const backgroundImages = await fetchData('./media-list.json');
            // fetchDataがnullを返す可能性があるのでチェック
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

    // ----------- タブ切り替え処理 -----------
    function setupTabs() {
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const targetId = tab.dataset.tab;
                tabContents.forEach(tc => {
                    tc.classList.toggle('hidden', tc.id !== targetId);
                });

                // 各タブの初回クリック時に初期化処理を実行
                if (targetId === 'damage' && !damageTabInitialized) setupDamageTab();
                // 表示したコンテンツをスクロールして上部に揃える（固定ヘッダ分を考慮）
                // 自動スクロールが不要なためデフォルトでは無効化しています
                const showContent = document.getElementById(targetId);
                if (showContent && AUTO_SCROLL_ON_TAB) scrollContentIntoView(showContent);
            });
        });
    }

    // 固定ヘッダ等を考慮して要素を上部にスクロールするヘルパー
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

    // ----------- 各タブの初期化 -----------
    function setupDamageTab() {
        if (damageTabInitialized) return;
        // イベントリスナー設定
        [dungeonSelect, floorSelect, inputA, inputB, inputC, inputL].forEach(el => {
            el.addEventListener('change', runDamageCalculation);
            if (el.tagName === 'INPUT') el.addEventListener('input', runDamageCalculation);
        });
        // 初期計算実行
        runDamageCalculation();
        damageTabInitialized = true;
    }

    // 経験値/HPタブは削除されました

    // ----------- 計算処理 -----------
    function runDamageCalculation() {
        const selectedDungeon = dungeonSelect.value;
        const selectedFloor = floorSelect.value;
        resultsTableBody.innerHTML = ''; // 計算結果をクリア

        if (!selectedDungeon || !selectedFloor) {
            totalReductionRateDisplay.textContent = ''; // 総軽減率表示もクリア
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

        const damageData = damageDungeonData[selectedDungeon][selectedFloor];
        // データが文字列の場合、数値の配列に変換。それ以外（配列など）ならそのまま使うか空配列に。
        const damageRatios = typeof damageData === 'string'
            ? damageData.split(',').map(s => parseFloat(s.replace('%', '')))
            : (Array.isArray(damageData) ? damageData : []);

        damageRatios.forEach(ratio => {
            if (isNaN(ratio)) return; // 無効なデータはスキップ
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

    // ユーティリティ: 文字列から数値を安全に取り出す（カンマ・単位などを除去）
    function parseNumberFromString(value, fallback = NaN) {
        if (value === null || value === undefined) return fallback;
        if (typeof value === 'number') return value;
        const s = String(value).replace(/,/g, '').replace(/[^\d.\-]/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? fallback : n;
    }

    // 経験値計算ロジックは削除されました

// HP計算機能は削除されました

    // ----------- ポップアップと同期ボタンの処理 -----------
    function setupPopupsAndSync() {
        notificationIcon.addEventListener('click', () => {
            notificationPopup.classList.remove('hidden');
            notificationBadge.classList.add('hidden');
            notificationIcon.classList.remove('active');
            if (latestNotificationDate) {
                localStorage.setItem('lastReadNotificationDate', latestNotificationDate);
            }
        });
        popupOverlay.addEventListener('click', () => notificationPopup.classList.add('hidden'));
        popupCloseButton.addEventListener('click', () => notificationPopup.classList.add('hidden'));

        // 存在する場合のみイベント登録
        if (linksPopupButton && linksPopup) {
            linksPopupButton.addEventListener('click', () => linksPopup.classList.remove('hidden'));
        }
        if (linksPopupOverlay && linksPopup) {
            linksPopupOverlay.addEventListener('click', () => linksPopup.classList.add('hidden'));
        }
        if (linksPopupCloseButton && linksPopup) {
            linksPopupCloseButton.addEventListener('click', () => linksPopup.classList.add('hidden'));
        }

        syncButton.addEventListener('click', async () => {
            syncButton.disabled = true;
            syncButton.textContent = '同期中...';

            const activeTab = document.querySelector('.tab-button.active');
            if (activeTab) {
                localStorage.setItem('lastActiveTab', activeTab.dataset.tab);
            }
            if ('caches' in window) {
                const names = await caches.keys();
                await Promise.all(names.map(name => caches.delete(name)));
            }
            // Service Workerの登録解除（必要であれば）
            if ('serviceWorker' in navigator) {
                const registration = await navigator.serviceWorker.getRegistration();
                if (registration) {
                    await registration.unregister();
                }
            }
            location.reload(true); // 強制リロード
        });
    }

    async function fetchAndShowNotifications() {
        try {
            const notifications = await fetchData('./announcements.json');
             // fetchDataがnullを返す可能性があるのでチェック
            if (!notifications || !Array.isArray(notifications)) {
                notificationList.innerHTML = '<p>お知らせの読み込みに失敗しました。</p>';
                return;
            }
            notificationList.innerHTML = ''; // リストをクリア
            if (notifications.length > 0) {
                latestNotificationDate = notifications[0].date;
                const lastReadDate = localStorage.getItem('lastReadNotificationDate');
                let unreadCount = 0;

                notifications.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'notification-item';
                    div.innerHTML = `<strong>${item.date}</strong><p>${item.content}</p>`;
                    notificationList.appendChild(div);
                    if (!lastReadDate || item.date > lastReadDate) unreadCount++;
                });

                notificationBadge.classList.toggle('hidden', unreadCount === 0);
                notificationIcon.classList.toggle('active', unreadCount > 0);
                if (unreadCount > 0) notificationBadge.textContent = unreadCount;
            } else {
                notificationList.innerHTML = '<p>新しいお知らせはありません。</p>';
                notificationBadge.classList.add('hidden'); // お知らせがない場合もバッジを隠す
                notificationIcon.classList.remove('active');
            }
        } catch (error) {
            console.error('お知らせ取得エラー:', error);
            notificationList.innerHTML = '<p>お知らせの読み込みに失敗しました。</p>';
        }
    }

    // ----------- 初期化処理 -----------
    async function initializeAll() {
        await setRandomBackground();

        // データの取得を待つ
        damageDungeonData = await fetchData('./dungeonData.json');

        // ▼▼▼【ここから修正】▼▼▼
        // プルダウンの初期化関数
        function initializeSelectWithOptions(selectElement, placeholderText, data) {
            selectElement.innerHTML = `<option value="">${placeholderText}</option>`; // プレースホルダーを追加
            if (data && typeof data === 'object') {
                Object.keys(data).forEach(name => selectElement.add(new Option(name, name)));
                selectElement.disabled = false; // データがあれば有効化
            } else {
                selectElement.disabled = true; // データがなければ無効化
            }
        }

        // ダメージ計算タブのプルダウン初期化
        initializeSelectWithOptions(dungeonSelect, 'ダンジョンを選択してください', damageDungeonData);
        initializeSelect(floorSelect, 'フロアを選択してください'); // フロアはダンジョン選択後に有効化

        // 経験値計算タブは削除されました
        // ▲▲▲【ここまで修正】▲▲▲

        // ダンジョン選択時のイベントリスナー
        dungeonSelect.addEventListener('change', () => {
            const selectedDungeon = dungeonSelect.value;
            initializeSelect(floorSelect, 'フロアを選択してください'); // フロアをリセット
            if (selectedDungeon && damageDungeonData[selectedDungeon]) {
                Object.keys(damageDungeonData[selectedDungeon]).forEach(name => floorSelect.add(new Option(name, name)));
                floorSelect.disabled = false;
            } else {
                floorSelect.disabled = true;
            }
             runDamageCalculation(); // ダンジョン変更時も計算実行
        });

        // 経験値イベントは削除されました

        // 補助的な初期化関数（プレースホルダーのみ設定）
        function initializeSelect(selectElement, placeholderText) {
             selectElement.innerHTML = `<option value="">${placeholderText}</option>`;
             selectElement.disabled = true;
        }


        setupTabs();
        setupPopupsAndSync();

        // 前回表示していたタブを復元、またはデフォルトタブを表示
        const lastTab = localStorage.getItem('lastActiveTab');
        let initialTab = null;
        if (lastTab) {
            initialTab = document.querySelector(`.tab-button[data-tab="${lastTab}"]`);
        }
        if (!initialTab) {
            // .tab-buttonのうち最初のものをデフォルトに
            initialTab = document.querySelector('.tab-button');
        }
        // すべてのタブ内容を一旦非表示
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
        // 初期タブをアクティブ化
        if (initialTab) {
            document.querySelectorAll('.tab-button').forEach(t => t.classList.remove('active'));
            initialTab.classList.add('active');
            const targetId = initialTab.dataset.tab;
            const showContent = document.getElementById(targetId);
            if (showContent) showContent.classList.remove('hidden');
            // 初期化も実行
            if (targetId === 'damage' && !damageTabInitialized) setupDamageTab();
            // 初期表示時にもスクロール位置を調整（必要なら有効化する）
            if (showContent && AUTO_SCROLL_ON_TAB) scrollContentIntoView(showContent);
        }
        localStorage.removeItem('lastActiveTab'); // 復元後は削除

        fetchAndShowNotifications();
    }

    initializeAll();
});
