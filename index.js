console.log("===== ไฟล์ index.js ของ RPG Status ถูกอ่านแล้ว! =====");

// นำเข้า API พื้นฐาน
import { extension_settings, getContext } from "../../../extensions.js";

// นำเข้า API ทั้งหมดจาก script.js
import { eventSource, event_types, extension_prompt_types, extension_prompt_roles, setExtensionPrompt } from "../../../../script.js";

// ชื่อของ Extension เรา (ใช้สำหรับเซฟการตั้งค่า)
const extensionName = "rpg-status-tracker";

// โครงสร้างข้อมูลตั้งต้น (Default Settings / Presets)
// โครงสร้างข้อมูลตั้งต้น (Default Settings / Presets)
const defaultSettings = {
    currentPreset: "fantasy", // Preset ที่กำลังใช้งานอยู่
    showFloatingButton: true,
    showFabButton: true,
    theme: "dark",

    // 1. ส่วนโครงสร้าง UI (Layout)
    presets: {
        "fantasy": {
            id: "fantasy",
            name: "Default Fantasy",
            tabs: [
                {
                    id: "tab-stats",
                    name: "สเตตัส",
                    modules: [
                        // Module A: ตัวเลขล้วน (Numeric)
                        { id: "hp", type: "numeric", name: "พลังชีวิต (HP)", default: 100, max: 100, min: 0, icon: "❤️" },
                        { id: "mp", type: "numeric", name: "มานา (MP)", default: 50, max: 50, min: 0, icon: "✨" },
                        { id: "str", type: "numeric", name: "พลังโจมตี (STR)", default: 10, icon: "⚔️" }
                    ]
                },
                {
                    id: "tab-inventory",
                    name: "กระเป๋า",
                    modules: [
                        // Module A: ตัวเลขล้วน (สำหรับเงิน)
                        { id: "gold", type: "numeric", name: "เหรียญทอง (Gold)", default: 0, icon: "💰" },

                        // Module B: ตัวเลข + คำบรรยาย (Complex/List)
                        { id: "items", type: "complex", name: "ไอเทมสวมใส่", default: [] }
                    ]
                },
                {
                    id: "tab-social",
                    name: "สังคม",
                    modules: [
                        // Module B: ใช้สำหรับความสัมพันธ์
                        { id: "relationships", type: "complex", name: "ความสัมพันธ์", default: [] }
                    ]
                }
            ]
        },
        "cyberpunk": {
            id: "cyberpunk",
            name: "Cyberpunk 2077",
            tabs: [
                {
                    id: "tab-stats",
                    name: "ระบบร่างกาย",
                    modules: [
                        { id: "hp", type: "numeric", name: "ความทนทาน (HP)", default: 100, max: 100, min: 0, icon: "🔋" },
                        { id: "ram", type: "numeric", name: "Cyberdeck RAM", default: 4, max: 10, min: 0, icon: "💾" }
                    ]
                },
                {
                    id: "tab-inventory",
                    name: "ช่องเก็บของ",
                    modules: [
                        { id: "credits", type: "numeric", name: "Eurodollars (Eddies)", default: 500, icon: "💶" },
                        { id: "cyberware", type: "complex", name: "ไซเบอร์แวร์", default: [] }
                    ]
                }
            ]
        }
    },

    // 2. ส่วนข้อมูลปัจจุบัน (Save Data) - จะถูกอัปเดตเมื่อ AI ตอบ
    saveData: {
        "fantasy": {
            "hp": 100,
            "mp": 50,
            "str": 10,
            "gold": 0,
            "items": [
                { name: "ดาบไม้เก่าๆ", amount: 1, desc: "ดาบเริ่มต้นสำหรับนักผจญภัย" },
                { name: "โพชั่นฟื้นฟู", amount: 3, desc: "ฟื้นฟู HP 20 หน่วย" }
            ],
            "relationships": []
        },
        "cyberpunk": {
            "hp": 100,
            "ram": 4,
            "credits": 500,
            "cyberware": []
        }
    }
};

async function initExtension() {
    console.log(`[${extensionName}] กำลังโหลด Extension...`);

    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = defaultSettings;
    }

    setupUI();
    eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
    eventSource.on(event_types.CHAT_CHANGED, handleChatChanged);

        // ลงทะเบียนฟังก์ชันให้ SillyTavern รู้จัก (ทำแค่ครั้งเดียวตอนโหลดเว็บ)
    try {
        setExtensionPrompt(
            extensionName,
            generateStatusPrompt, // ส่ง "ชื่อฟังก์ชัน" เข้าไป (ห้ามใส่วงเล็บ)
            0, // 0 = IN_PROMPT (แทรกใน System Prompt)
            1, // Depth/ความสำคัญ
            true, // ให้มีบรรทัดว่างคั่น
            0  // 0 = SYSTEM ROLE
        );
        console.log(`[${extensionName}] ✅ ลงทะเบียน Prompt สำเร็จ!`);
    } catch (error) {
        console.error(`[${extensionName}] ❌ ลงทะเบียน Prompt ล้มเหลว:`, error);
    }

    console.log(`[${extensionName}] 🎉 โหลดเสร็จสมบูรณ์!`);
}

// ฟังก์ชันสำหรับสร้างข้อความสถานะเพื่อส่งให้ AI
// ฟังก์ชันนี้จะถูก SillyTavern เรียกอัตโนมัติ "ทุกครั้ง" ที่เรากดส่งข้อความหา AI
function generateStatusPrompt() {
    const settings = extension_settings[extensionName];
    const currentPresetKey = settings.currentPreset;

    if (!settings.saveData || !settings.saveData[currentPresetKey]) return "";

    const saveData = settings.saveData[currentPresetKey];
    const presetLayout = settings.presets[currentPresetKey];

    let promptText = "\n[System Note - Player Current Status]\n";

    presetLayout.tabs.forEach(tab => {
        let tabData = [];
        tab.modules.forEach(module => {
            const val = saveData[module.id] !== undefined ? saveData[module.id] : module.default;

            if (module.type === "numeric") {
                let text = `${module.name.split(' ')[0]}: ${val}`;
                if (module.max !== undefined) text += `/${module.max}`;
                tabData.push(text);
            }
            // --- กรณีเป็น Module แบบ ตัวเลข+คำบรรยาย (Complex) ---
            else if (module.type === "complex") {
                if (Array.isArray(val) && val.length > 0) {
                    const itemsText = val.map(item => {
                        // เริ่มต้นด้วย ชื่อ(xจำนวน)
                        let text = `${item.name}(x${item.amount})`;

                        // ถ้ามีคำอธิบาย (desc) ให้เอามาต่อท้ายในวงเล็บเหลี่ยม
                        if (item.desc && item.desc.trim() !== "") {
                            text += ` [${item.desc}]`;
                        }
                        return text;
                    }).join(', ');

                    tabData.push(`${module.name.split(' ')[0]}: ${itemsText}`);
                } else {
                    tabData.push(`${module.name.split(' ')[0]}: Empty`);
                }
            }

            // 🌟 [ใหม่] แปลง Profile เป็นข้อความสั้นๆ
            else if (module.type === "profile") {
                if (typeof val === 'object' && val !== null) {
                    // แปลง { hp: "100", status: "ดี" } เป็น "hp: 100, status: ดี"
                    const stats = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(', ');
                    tabData.push(`${module.name.split(' ')[0]}: [${stats}]`);
                } else {
                    tabData.push(`${module.name.split(' ')[0]}: No Data`);
                }
            }

            // 🌟 [ใหม่] จัดการ Chat (ส่งไปแค่ 3 ข้อความล่าสุด ประหยัด Token!)
            else if (module.type === "chat") {
                if (Array.isArray(val) && val.length > 0) {
                    // ดึงมาแค่ 3 ข้อความสุดท้าย (slice(-3))
                    const recentChats = val.slice(-3).map(c => `${c.sender}: "${c.message}"`).join(' | ');
                    tabData.push(`[Phone] ${module.name.split(' ')[0]}: ${recentChats}`);
                } else {
                    tabData.push(`[Phone] ${module.name.split(' ')[0]}: Empty`);
                }
            }

            // 🌟 [แก้ไข] ส่งข้อมูล Skill ให้ AI (เพิ่มคำอธิบาย desc)
            else if (module.type === "skill") {
                if (Array.isArray(val) && val.length > 0) {
                    const skillsText = val.map(s => {
                        // เริ่มต้นด้วย ชื่อ(Lv.) [สถานะ]
                        let text = `${s.name}(Lv.${s.level || 1}) [สถานะ: ${s.status || "พร้อมใช้งาน"}]`;

                        // ถ้ามีคำอธิบาย ให้เอามาต่อท้าย
                        if (s.desc && s.desc.trim() !== "") {
                            text += ` - ${s.desc}`;
                        }
                        return text;
                    }).join(', ');

                    tabData.push(`${module.name.split(' ')[0]}: ${skillsText}`);
                } else {
                    tabData.push(`${module.name.split(' ')[0]}: Empty`);
                }
            }

        });

        if (tabData.length > 0) {
            promptText += tabData.join(' | ') + "\n";
        }
    });

    const finalPrompt = promptText.trim();

    // แจ้งเตือนใน Console ว่าระบบกำลังดึงข้อมูลไปให้ AI
    console.log(`[${extensionName}] 📨 SillyTavern กำลังดึงสถานะไปส่งให้ AI: \n${finalPrompt}`);

    return finalPrompt;
}

//ฟังก์ชั่นสำหรับสร้างหน้าต่าง UI
function setupUI() {
    console.log(`[${extensionName}] ⏳ กำลังเริ่มสร้าง UI...`);
    const settings = extension_settings[extensionName];

    try {
        // ==========================================
        // ส่วนที่ 1: สร้างปุ่มลอย (ที่เมนูด้านบน)
        // ==========================================
        const topMenu = document.getElementById('extensionsMenu');
        if (!topMenu) throw new Error("ไม่พบ Element 'extensionsMenu'");

        // เช็คก่อนว่ามีปุ่มเดิมอยู่ไหม ถ้ามีให้ลบทิ้งก่อน (ป้องกันปุ่มซ้ำซ้อนเวลารีเฟรช)
        if (document.getElementById('rpg-status-floating-btn')) {
            document.getElementById('rpg-status-floating-btn').remove();
        }

        const floatingBtn = document.createElement('div');
        floatingBtn.id = 'rpg-status-floating-btn';
        floatingBtn.title = 'เปิดหน้าต่างสถานะตัวละคร';
        floatingBtn.innerHTML = '<i class="fa-solid fa-address-card"></i> Status';
        floatingBtn.style.display = settings.showFloatingButton ? 'inline-flex' : 'none';

        floatingBtn.addEventListener('click', () => {
            $('#rpg-status-modal').fadeToggle(200);
        });
        topMenu.appendChild(floatingBtn);

        // ==========================================
        // 🌟 ส่วนที่ 1.5: สร้างปุ่มกลมมุมจอ (FAB)
        // ==========================================
        if (document.getElementById('rpg-fab-btn')) {
            document.getElementById('rpg-fab-btn').remove();
        }

        const fabBtn = document.createElement('div');
        fabBtn.id = 'rpg-fab-btn';
        fabBtn.title = 'เปิดหน้าต่างสถานะ';
        fabBtn.innerHTML = '<i class="fa-solid fa-user-astronaut"></i>'; // ใช้ไอคอนนักบินอวกาศ หรือเปลี่ยนเป็น fa-address-card ก็ได้ครับ
        fabBtn.style.display = settings.showFabButton ? 'flex' : 'none';

        fabBtn.addEventListener('click', () => {
            $('#rpg-status-modal').fadeToggle(200);
        });
        document.body.appendChild(fabBtn);

        // ==========================================
        // ส่วนที่ 2: สร้าง UI ในแผงควบคุม (Extensions Panel)
        // ==========================================
        const extensionPanel = document.getElementById('extensions_settings');
        if (!extensionPanel) throw new Error("ไม่พบ Element 'extensions_settings'");

        // ลบของเก่าทิ้งก่อนถ้ามี
        $('#rpg-extension-panel-block').remove();

        const panelContainer = document.createElement('div');
        panelContainer.id = 'rpg-extension-panel-block';
        panelContainer.className = 'extension_settings_block';
        panelContainer.innerHTML = `<h4><i class="fa-solid fa-address-card"></i> RPG Status Tracker</h4>`;

        const panelOpenBtn = document.createElement('button');
        panelOpenBtn.className = 'menu_button';
        panelOpenBtn.innerHTML = 'เปิดหน้าต่างสถานะ';
        panelOpenBtn.addEventListener('click', () => {
            $('#rpg-status-modal').fadeToggle(200);
        });
        panelContainer.appendChild(panelOpenBtn);

        // 🌟 สร้างสวิตช์ 2 ตัว
        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginTop = '10px';
        toggleContainer.innerHTML = `
            <label class="checkbox_label">
                <input type="checkbox" id="rpg-toggle-floating-btn" ${settings.showFloatingButton ? 'checked' : ''}>
                <span>แสดงปุ่ม Status ที่เมนูด้านบน</span>
            </label>
            <br>
            <label class="checkbox_label" style="margin-top: 5px;">
                <input type="checkbox" id="rpg-toggle-fab-btn" ${settings.showFabButton ? 'checked' : ''}>
                <span>แสดงปุ่มกลม (FAB) ที่มุมขวาล่าง</span>
            </label>
        `;
        panelContainer.appendChild(toggleContainer);

        // 🌟 สำคัญมาก: ต้องเอาไปแปะบนจอก่อน ค่อยผูกคำสั่ง
        extensionPanel.appendChild(panelContainer);

        // 🌟 ใช้ jQuery ผูกคำสั่ง (ปลอดภัย 100%)
        $('#rpg-toggle-floating-btn').on('change', function() {
            const isChecked = $(this).is(':checked');
            settings.showFloatingButton = isChecked;
            $('#rpg-status-floating-btn').css('display', isChecked ? 'inline-flex' : 'none');
        });

        $('#rpg-toggle-fab-btn').on('change', function() {
            const isChecked = $(this).is(':checked');
            settings.showFabButton = isChecked;
            $('#rpg-fab-btn').css('display', isChecked ? 'flex' : 'none');
        });

        // ==========================================
        // ส่วนที่ 3: สร้างหน้าต่างลอย (Modal)
        // ==========================================
        // ลบหน้าต่างเก่าทิ้งก่อน (ถ้ามี)
        $('#rpg-status-modal').remove();

        const modalHtml = `
            <div id="rpg-status-modal" style="display: none;">
                <div class="rpg-modal-header">
                    <div class="rpg-header-controls">
                        <select class="rpg-preset-select" id="rpg-preset-dropdown"></select>
                        <button class="rpg-icon-btn" id="rpg-theme-btn" title="สลับโหมดสว่าง/มืด"><i class="fa-solid fa-moon"></i></button>
                        <button class="rpg-icon-btn" id="rpg-new-preset-btn" title="สร้าง Preset ใหม่"><i class="fa-solid fa-plus"></i></button>
                        <button class="rpg-icon-btn" id="rpg-edit-preset-btn" title="แก้ไขโครงสร้าง Preset"><i class="fa-solid fa-pen"></i></button>
                        <button class="rpg-icon-btn" id="rpg-delete-preset-btn" title="ลบ Preset นี้" style="color: #ff6b6b;"><i class="fa-solid fa-trash"></i></button>
                        <button class="rpg-reset-btn" id="rpg-reset-btn" title="รีเซ็ตข้อมูล"><i class="fa-solid fa-rotate-right"></i></button>
                    </div>
                    <div class="rpg-close-btn" id="rpg-close-btn"><i class="fa-solid fa-xmark"></i></div>
                </div>

                <div class="rpg-tabs"></div>
                <div class="rpg-modal-content"></div>

                <div id="rpg-editor-container" style="display: none; flex-direction: column; flex-grow: 1; padding: 15px; background-color: rgba(0,0,0,0.5);">
                    <p style="margin: 0 0 5px 0; font-size: 0.85em; color: #aaa;">แก้ไขโครงสร้าง Tabs และ Modules (รูปแบบ JSON)</p>
                    <textarea id="rpg-preset-editor" spellcheck="false" style="flex-grow: 1; width: 100%; min-height: 250px; background-color: #1e1e1e; color: #d4d4d4; border: 1px solid #444; border-radius: 5px; padding: 10px; font-family: monospace; font-size: 0.9em; resize: vertical; white-space: pre;"></textarea>
                    <button id="rpg-save-preset-btn" style="margin-top: 10px; background-color: #5cb85c; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold;"><i class="fa-solid fa-floppy-disk"></i> บันทึก Preset</button>
                </div>
            </div>
        `;
        $('body').append(modalHtml); // สร้าง HTML ลงบนจอ

        // ==========================================
        // ส่วนที่ 4: ผูกคำสั่งให้ปุ่มต่างๆ (Event Listeners)
        // ==========================================

        // ปุ่มปิดหน้าต่าง (กากบาท)
        $('#rpg-close-btn').on('click', () => $('#rpg-status-modal').fadeOut(200));

        // Dropdown เปลี่ยน Preset
        $('#rpg-preset-dropdown').on('change', function() {
            settings.currentPreset = $(this).val();
            renderUI();
        });

        // ปุ่ม Reset ข้อมูล
        $('#rpg-reset-btn').on('click', () => {
            if(confirm("คุณต้องการรีเซ็ตค่าสถานะทั้งหมดของ Preset นี้ ให้กลับเป็นค่าเริ่มต้นหรือไม่?")) {
                const currentKey = settings.currentPreset;
                const resetData = {};
                settings.presets[currentKey].tabs.forEach(tab => {
                    tab.modules.forEach(module => {
                        resetData[module.id] = Array.isArray(module.default) ? JSON.parse(JSON.stringify(module.default)) : module.default;
                    });
                });
                settings.saveData[currentKey] = resetData;
                renderUI();
            }
        });

        // 🌟 ปุ่ม "+" สร้าง Preset ใหม่
        $('#rpg-new-preset-btn').on('click', () => {
            const presetName = prompt("ตั้งชื่อ Preset ใหม่ของคุณ:");
            if (!presetName) return;

            const presetId = "custom_" + Date.now();
            settings.presets[presetId] = {
                id: presetId,
                name: presetName,
                tabs: [
                    {
                        id: "tab-main",
                        name: "ทั่วไป",
                        modules: [
                            { id: "hp", type: "numeric", name: "พลังชีวิต", default: 100, max: 100, min: 0, icon: "❤️" }
                        ]
                    }
                ]
            };
            settings.saveData[presetId] = { hp: 100 };
            settings.currentPreset = presetId;
            renderUI();
        });

        // 🌟 ปุ่ม "✏️" เปิดหน้าต่างแก้ไข JSON
        $('#rpg-edit-preset-btn').on('click', () => {
            const currentKey = settings.currentPreset;
            const tabsData = settings.presets[currentKey].tabs;

            $('#rpg-preset-editor').val(JSON.stringify(tabsData, null, 4));

            $('.rpg-tabs, .rpg-modal-content').hide();
            $('#rpg-editor-container').css('display', 'flex');
        });

        // 🌟 ปุ่ม "💾" บันทึก JSON ที่แก้ไข
        $('#rpg-save-preset-btn').on('click', () => {
            try {
                const currentKey = settings.currentPreset;
                const editorValue = $('#rpg-preset-editor').val();
                const newTabsData = JSON.parse(editorValue);

                settings.presets[currentKey].tabs = newTabsData;

                newTabsData.forEach(tab => {
                    tab.modules.forEach(mod => {
                        if (settings.saveData[currentKey][mod.id] === undefined) {
                            settings.saveData[currentKey][mod.id] = Array.isArray(mod.default) ? [] : mod.default;
                        }
                    });
                });

                        // 🌟 ปุ่ม "🗑️" ลบ Preset ปัจจุบัน
        $('#rpg-delete-preset-btn').on('click', () => {
            const currentKey = settings.currentPreset;

            // เช็คก่อนว่ามี Preset เหลือมากกว่า 1 อันไหม (ไม่งั้นลบหมดแล้วระบบจะพัง)
            const presetKeys = Object.keys(settings.presets);
            if (presetKeys.length <= 1) {
                alert("ไม่สามารถลบได้! ต้องมี Preset เหลืออยู่อย่างน้อย 1 อันเสมอครับ");
                return;
            }

            // เด้งถามเพื่อความชัวร์
            const presetName = settings.presets[currentKey].name;
            if(confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบ Preset "${presetName}" ?\n(ข้อมูลสถานะและไอเทมทั้งหมดของ Preset นี้จะหายไปอย่างถาวร)`)) {

                // ลบข้อมูลออกจากระบบ
                delete settings.presets[currentKey];
                delete settings.saveData[currentKey];

                // เปลี่ยนให้ไปใช้ Preset ตัวแรกสุดที่เหลืออยู่แทน
                const remainingKeys = Object.keys(settings.presets);
                settings.currentPreset = remainingKeys[0];

                console.log(`[${extensionName}] 🗑️ ลบ Preset สำเร็จ! สลับไปใช้: ${settings.currentPreset}`);

            }
        });

                $('#rpg-editor-container').hide();
                $('.rpg-tabs, .rpg-modal-content').show();
                renderUI();

            } catch (error) {
                alert("เกิดข้อผิดพลาด! รูปแบบ JSON ไม่ถูกต้อง\n\nรายละเอียด: " + error.message);
            }
        });

                // 🌟 ปุ่มสลับธีม (Light/Dark Mode)
        $('#rpg-theme-btn').on('click', () => {
            const modal = $('#rpg-status-modal');
            const icon = $('#rpg-theme-btn i');

            if (settings.theme === "dark") {
                settings.theme = "light";
                modal.addClass('rpg-light-mode');
                icon.removeClass('fa-moon').addClass('fa-sun');
            } else {
                settings.theme = "dark";
                modal.removeClass('rpg-light-mode');
                icon.removeClass('fa-sun').addClass('fa-moon');
            }
        });

        // เซ็ตธีมเริ่มต้นตอนเปิดหน้าต่างครั้งแรก
        if (settings.theme === "light") {
            $('#rpg-status-modal').addClass('rpg-light-mode');
            $('#rpg-theme-btn i').removeClass('fa-moon').addClass('fa-sun');
        }

        // 🌟 ระบบลากหน้าต่าง (Draggable)
        const statusModal = $('#rpg-status-modal');

        // เปิดระบบลากเฉพาะหน้าจอคอม (กว้างกว่า 768px)
        if (window.innerWidth > 768) {
            statusModal.draggable({
                handle: ".rpg-modal-header",
                containment: "window",
                cancel: "select, button, .rpg-icon-btn, .rpg-reset-btn"
            });
        }

        // คอยเช็คเวลามีการหมุนจอหรือย่อขยายหน้าต่าง
        $(window).on('resize', function() {
            if (window.innerWidth <= 768) {
                // ถ้าจอมือถือ ให้ปิดระบบลาก (คืนการสัมผัสให้ Dropdown)
                if (statusModal.hasClass('ui-draggable')) {
                    statusModal.draggable('destroy');
                }
            } else {
                // ถ้าจอคอม ให้เปิดระบบลาก
                if (!statusModal.hasClass('ui-draggable')) {
                    statusModal.draggable({
                        handle: ".rpg-modal-header",
                        containment: "window",
                        cancel: "select, button, .rpg-icon-btn, .rpg-reset-btn"
                    });
                }
            }
        });

        // สั่งวาดเนื้อหาในหน้าต่างครั้งแรก
        renderUI();
        console.log(`[${extensionName}] 🎉 โหลด UI ทั้งหมดเสร็จสมบูรณ์!`);

    } catch (error) {
        console.error(`[${extensionName}] ❌ เกิดข้อผิดพลาดในการสร้าง UI:`, error);
    }
}

// ฟังก์ชันสำหรับตรวจสอบข้อความ AI ด้วย Regex
async function handleIncomingMessage() {
    const context = getContext();
    const chat = context.chat;
    if (chat.length === 0) return;

    // ดึงข้อความล่าสุด (ของ AI) มาตรวจสอบ
    const lastMessage = chat[chat.length - 1];
    if (lastMessage.is_user) return; // ถ้าเป็นข้อความผู้เล่น ให้ข้ามไป

    let text = lastMessage.mes;

    // 1. Regex ดักจับข้อความที่อยู่ใน <update> ... </update>
    const updateRegex = /<update>([\s\S]*?)<\/update>/i;
    const match = text.match(updateRegex);

    if (match) {
        console.log("[RPG Status] พบคำสั่งอัปเดตจาก AI!");
        const updateBlock = match[1].trim(); // ข้อความข้างในแท็ก

        // 2. นำข้อความมาแยกทีละบรรทัด
        const lines = updateBlock.split('\n');

        const settings = extension_settings[extensionName];
        const currentPresetKey = settings.currentPreset;
        const saveData = settings.saveData[currentPresetKey];
        const presetLayout = settings.presets[currentPresetKey];

        // สร้างตัวแปรเก็บ Module ทั้งหมดใน Preset นี้ เพื่อเอาไว้เช็คประเภท
        const allModules = {};
        presetLayout.tabs.forEach(tab => {
            tab.modules.forEach(mod => { allModules[mod.id] = mod; });
        });

        // 3. ประมวลผลทีละบรรทัด
        lines.forEach(line => {
            // แยก Key และ Value เช่น "gold: +50" -> key="gold", value="+50"
            const parts = line.split(':');
            if (parts.length < 2) return;

            const key = parts[0].trim().toLowerCase();
            const valueStr = parts.slice(1).join(':').trim(); // เผื่อในคำอธิบายมีเครื่องหมาย :

            const moduleDef = allModules[key];
            if (!moduleDef) return; // ถ้าไม่มี Key นี้ในระบบ ให้ข้ามไป

            // --- กรณีเป็น Module ตัวเลขล้วน (Numeric) เช่น HP, Gold ---
            if (moduleDef.type === "numeric") {
                // เช็คว่ามีเครื่องหมาย + หรือ - นำหน้าไหม
                const isRelative = valueStr.startsWith('+') || valueStr.startsWith('-');
                const numValue = parseInt(valueStr);

                if (!isNaN(numValue)) {
                    if (isRelative) {
                        saveData[key] += numValue; // บวกหรือลบจากค่าเดิม
                    } else {
                        saveData[key] = numValue; // ตั้งค่าใหม่ (Set)
                    }

                    // ป้องกันค่าเกิน Max หรือต่ำกว่า Min
                    if (moduleDef.max !== undefined && saveData[key] > moduleDef.max) saveData[key] = moduleDef.max;
                    if (moduleDef.min !== undefined && saveData[key] < moduleDef.min) saveData[key] = moduleDef.min;
                }
            }

            // --- กรณีเป็น Module แบบ Complex (เช่น ไอเทม) ---
            // Format ที่คาดหวัง: "items: โพชั่น +2 (คำอธิบาย)" หรือ "items: ดาบไม้ -1"
            else if (moduleDef.type === "complex") {
                // Regex แยกชื่อ, จำนวน (+/-), และคำอธิบาย(ในวงเล็บ)
                const itemRegex = /^(.*?)\s*([+-]\d+)?\s*(?:\((.*?)\))?$/;
                const itemMatch = valueStr.match(itemRegex);

                if (itemMatch) {
                    const itemName = itemMatch[1].trim();
                    const itemAmount = itemMatch[2] ? parseInt(itemMatch[2]) : 1; // ถ้าไม่ใส่เลข ถือว่า +1
                    const itemDesc = itemMatch[3] ? itemMatch[3].trim() : "";

                    // หาว่ามีไอเทมนี้ในกระเป๋าหรือยัง
                    let existingItem = saveData[key].find(i => i.name === itemName);

                    if (existingItem) {
                        existingItem.amount += itemAmount;
                        if (itemDesc) existingItem.desc = itemDesc; // อัปเดตคำอธิบายถ้ามีมาใหม่
                    } else if (itemAmount > 0) {
                        // ถ้ายังไม่มี และจำนวนเป็นบวก ให้เพิ่มชิ้นใหม่
                        saveData[key].push({ name: itemName, amount: itemAmount, desc: itemDesc });
                    }

                    // ลบไอเทมทิ้ง ถ้าจำนวนเหลือ 0 หรือติดลบ
                    saveData[key] = saveData[key].filter(i => i.amount > 0);
                }
            }

                        // 🌟 [ใหม่] กรณีเป็น Module แบบ Profile (สเตตัสตัวละคร) 🌟
            // ฟอร์แมตที่ AI ต้องพิมพ์: char_alice: hp = 80/100 หรือ char_alice: สถานะ = บาดเจ็บ
            else if (moduleDef.type === "profile") {
                // แยกคีย์ย่อยและค่าออกจากกันด้วยเครื่องหมาย =
                const profileMatch = valueStr.match(/^(.*?)\s*=\s*(.*)$/);
                if (profileMatch) {
                    const statKey = profileMatch[1].trim();
                    const statValue = profileMatch[2].trim();

                    // ถ้ายังไม่มีข้อมูล Object ของตัวละครนี้ ให้สร้างใหม่
                    if (typeof saveData[key] !== 'object' || Array.isArray(saveData[key])) {
                        saveData[key] = {};
                    }

                    // บันทึกค่าลงไป
                    saveData[key][statKey] = statValue;
                }
            }

            // 🌟 [ใหม่] กรณีเป็น Module แบบ Chat (ข้อความโทรศัพท์) 🌟
            // ฟอร์แมตที่ AI ต้องพิมพ์: party_chat: อลิซ = นายอยู่ไหน รีบมาช่วยที!
            else if (moduleDef.type === "chat") {
                const chatMatch = valueStr.match(/^(.*?)\s*=\s*(.*)$/);
                if (chatMatch) {
                    const sender = chatMatch[1].trim();
                    const message = chatMatch[2].trim();

                    // ถ้ายังไม่มี Array ให้สร้างใหม่
                    if (!Array.isArray(saveData[key])) {
                        saveData[key] = [];
                    }

                    // ดันข้อความใหม่เข้าไปในแชท
                    saveData[key].push({ sender: sender, message: message });
                }
            }

            // 🌟 [ใหม่] กรณีเป็น Module แบบ Skill (รองรับการอัปเลเวล!)
            else if (moduleDef.type === "skill") {
                // Regex ใหม่: จับชื่อสกิล (+/-เลเวล) = สถานะ (คำอธิบาย)
                const skillMatch = valueStr.match(/^(.*?)(?:\s*([+-]\d+))?(?:\s*=\s*(.*?))?(?:\s*\((.*?)\))?$/);

                if (skillMatch) {
                    const skillName = skillMatch[1].trim();
                    const levelChange = skillMatch[2] ? parseInt(skillMatch[2]) : 0; // ดึงตัวเลข +1
                    const newStatus = skillMatch[3] ? skillMatch[3].trim() : null;   // ดึงสถานะหลังเครื่องหมาย =
                    const newDesc = skillMatch[4] ? skillMatch[4].trim() : null;     // ดึงคำอธิบายในวงเล็บ

                    if (!Array.isArray(saveData[key])) saveData[key] = [];

                    let existingSkill = saveData[key].find(s => s.name === skillName);

                    if (existingSkill) {
                        // ถ้ามีสกิลนี้อยู่แล้ว
                        existingSkill.level = (existingSkill.level || 1) + levelChange; // บวกเลเวล
                        if (newStatus) existingSkill.status = newStatus; // เปลี่ยนสถานะ (ถ้ามีสั่ง)
                        if (newDesc) existingSkill.desc = newDesc; // เปลี่ยนคำอธิบาย (ถ้ามีสั่ง)
                    } else {
                        // ถ้าเป็นสกิลใหม่เอี่ยม
                        saveData[key].push({
                            name: skillName,
                            level: 1 + (levelChange > 0 ? levelChange - 1 : 0),
                            desc: newDesc || "ไม่มีคำอธิบาย",
                            status: newStatus || "พร้อมใช้งาน"
                        });
                    }
                }
            }

        });

        // 4. ลบแท็ก <update> ออกจากหน้าแชท
        const cleanedText = text.replace(match[0], '').trim();
        lastMessage.mes = cleanedText;

        // 5. อัปเดตหน้าต่าง UI สถานะของเรา!
        renderUI();
        console.log(`[${extensionName}] ✅ อัปเดตสถานะและ UI เรียบร้อยแล้ว!`);

        // 🌟 6. แสดงการแจ้งเตือนให้ผู้เล่นรู้! 🌟
        // 6.1 ทำให้ปุ่ม Status กระพริบแสงสีเขียว 2 วินาที
        const statusBtn = $('#rpg-status-floating-btn');
        statusBtn.removeClass('rpg-updated-glow'); // ล้างของเก่าก่อนเผื่อมันกระพริบอยู่
        void statusBtn[0].offsetWidth; // ทริคบังคับให้ CSS รีเฟรช
        statusBtn.addClass('rpg-updated-glow');

        // 6.2 เด้งป๊อปอัปแจ้งเตือนมุมขวาบน (ใช้ระบบ Toast ของ SillyTavern)
        if (typeof toastr !== 'undefined') {
            toastr.info("ตรวจสอบและอัปเดตสถานะตัวละครเรียบร้อยแล้ว", "RPG Status");
        }

        // 7. บังคับรีเฟรชหน้าแชท 1 ครั้ง เพื่อให้ข้อความ <update> หายไป
        setTimeout(() => {
            reloadCurrentChat();
        }, 100);
    }
}

// ฟังก์ชันเมื่อเปลี่ยนแชท หรือสลับไปคุยกับตัวละครอื่น
function handleChatChanged() {
    console.log("[RPG Status] เปลี่ยนแชท - กำลังอัปเดต UI");

    // 1. ปิดหน้าต่างสถานะลงไปก่อน (เพื่อไม่ให้เกะกะเวลาเปิดแชทใหม่)
    $('#rpg-status-modal').fadeOut(200);

    // 2. สั่งให้วาดหน้าจอใหม่ เผื่อมีการอัปเดตข้อมูลเบื้องหลัง
    renderUI();
}

// ฟังก์ชันสำหรับวาด UI ใหม่ทั้งหมดตาม Preset ที่เลือก
function renderUI() {
    const settings = extension_settings[extensionName];
    const currentPresetKey = settings.currentPreset;
    const presetLayout = settings.presets[currentPresetKey];
    const saveData = settings.saveData[currentPresetKey];

    // 1. อัปเดต Dropdown
    const dropdown = $('#rpg-preset-dropdown');
    dropdown.empty(); // ล้างของเก่า
    for (const key in settings.presets) {
        const isSelected = key === currentPresetKey ? "selected" : "";
        dropdown.append(`<option value="${key}" ${isSelected}>${settings.presets[key].name}</option>`);
    }

    // 2. เตรียมพื้นที่วาด Tabs และ เนื้อหา
    const tabsContainer = $('.rpg-tabs');
    const contentContainer = $('.rpg-modal-content');
    tabsContainer.empty();
    contentContainer.empty();

    // 3. วนลูปสร้าง Tabs และ Modules ตาม JSON
    presetLayout.tabs.forEach((tab, index) => {
        const isActive = index === 0 ? "active" : ""; // ให้ Tab แรกเปิดเป็นค่าเริ่มต้น

        // สร้างปุ่ม Tab
        tabsContainer.append(`
            <button class="rpg-tab-btn ${isActive}" data-target="${tab.id}">${tab.name}</button>
        `);

        // สร้างกล่องเนื้อหาของ Tab
        let tabContentHtml = `<div id="${tab.id}" class="rpg-tab-content ${isActive}">`;

        // วนลูปสร้าง Modules ภายใน Tab นี้
        tab.modules.forEach(module => {
            tabContentHtml += `<div class="rpg-module-group">`;
            tabContentHtml += `<div class="rpg-module-title">${module.name}</div>`;

            // ดึงค่าปัจจุบันจาก Save Data (ถ้าไม่มีให้ใช้ default)
            const currentValue = saveData[module.id] !== undefined ? saveData[module.id] : module.default;

            // --- ถ้าเป็น Module แบบ ตัวเลขล้วน (Numeric) ---
            if (module.type === "numeric") {
                let displayValue = currentValue;
                // ถ้ามี max ให้แสดงแบบ 100/100
                if (module.max !== undefined) {
                    displayValue = `${currentValue} / ${module.max}`;
                }
                tabContentHtml += `
                    <div class="rpg-numeric-item">
                        <span class="rpg-numeric-label">${module.icon || ""} ${module.name}</span>
                        <span class="rpg-numeric-value">${displayValue}</span>
                    </div>
                `;
            }

            // --- ถ้าเป็น Module แบบ ตัวเลข+คำบรรยาย (Complex) ---
            else if (module.type === "complex") {
                tabContentHtml += `<div class="rpg-complex-list">`;

                if (Array.isArray(currentValue) && currentValue.length > 0) {
                    currentValue.forEach(item => {
                        tabContentHtml += `
                            <div class="rpg-complex-card">
                                <div class="rpg-complex-header">
                                    <span>${item.name}</span>
                                    <span class="rpg-complex-amount">x${item.amount}</span>
                                </div>
                                <div class="rpg-complex-desc">${item.desc || ""}</div>
                            </div>
                        `;
                    });
                } else {
                    tabContentHtml += `<div class="rpg-empty-text">- ว่างเปล่า -</div>`;
                }
                tabContentHtml += `</div>`;
            }

            // 🌟 วาดหน้าจอ Profile (ดีไซน์ใหม่)
            else if (module.type === "profile") {
                tabContentHtml += `<div class="rpg-profile-grid">`;
                if (typeof currentValue === 'object' && currentValue !== null && Object.keys(currentValue).length > 0) {
                    for (const [statKey, statValue] of Object.entries(currentValue)) {
                        tabContentHtml += `
                            <div class="rpg-profile-stat">
                                <div class="rpg-stat-label">${statKey}</div>
                                <div class="rpg-stat-value">${statValue}</div>
                            </div>`;
                    }
                } else {
                    tabContentHtml += `<div class="rpg-empty-text">- ไม่มีข้อมูลสเตตัส -</div>`;
                }
                tabContentHtml += `</div>`;
            }

            // 🌟 วาดหน้าจอ Chat (ดีไซน์ใหม่)
            else if (module.type === "chat") {
                tabContentHtml += `<div class="rpg-chat-container">`;
                if (Array.isArray(currentValue) && currentValue.length > 0) {
                    currentValue.forEach(msg => {
                        tabContentHtml += `
                            <div class="rpg-chat-bubble">
                                <div style="color: var(--holo-accent); font-weight: bold; margin-bottom: 3px; font-size: 0.9em;">${msg.sender}</div>
                                <div>${msg.message}</div>
                            </div>`;
                    });
                } else {
                    tabContentHtml += `<div class="rpg-empty-text">- ไม่มีข้อความใหม่ -</div>`;
                }
                tabContentHtml += `</div>`;
            }

                        // 🌟 [ใหม่] วาดหน้าจอ Skill
            else if (module.type === "skill") {
                tabContentHtml += `<div class="rpg-complex-list">`;
                if (Array.isArray(currentValue) && currentValue.length > 0) {
                    currentValue.forEach(skill => {
                        // เปลี่ยนสีป้ายสถานะ (ถ้ามีคำว่า พร้อม/Ready ให้เป็นสีเขียว นอกนั้นสีส้ม/แดง)
                        const isReady = skill.status === "พร้อมใช้งาน" || skill.status === "Ready";
                        const statusBg = isReady ? "#5cb85c" : "#f0ad4e";

                        tabContentHtml += `
                            <div class="rpg-complex-card" style="border-left-color: #f0ad4e;">
                                <div class="rpg-complex-header">
                                    <span>${skill.name} <span style="font-size:0.8em; opacity:0.5;">(Lv.${skill.level || 1})</span></span>
                                    <span class="rpg-complex-amount" style="background: ${statusBg}; box-shadow: 0 0 5px ${statusBg};">${skill.status}</span>
                                </div>
                                <div class="rpg-complex-desc">${skill.desc}</div>
                            </div>
                        `;
                    });
                } else {
                    tabContentHtml += `<div class="rpg-empty-text">- ไม่มีทักษะ -</div>`;
                }
                tabContentHtml += `</div>`;
            }

            tabContentHtml += `</div>`; // ปิด rpg-module-group
        });

        tabContentHtml += `</div>`; // ปิด rpg-tab-content
        contentContainer.append(tabContentHtml);
    });

        // ผูก Event Listener ให้ปุ่ม Tab ที่เพิ่งสร้างใหม่
        $('.rpg-tab-btn').off('click').on('click', function() {
            $('.rpg-tab-btn').removeClass('active');
            $('.rpg-tab-content').removeClass('active');
            $(this).addClass('active');
            const targetId = $(this).data('target');
            $(`#${targetId}`).addClass('active');
        });
        updateExtensionPrompt();
} // <-- ปิดฟังก์ชัน renderUI

// ฟังก์ชันสำหรับอัปเดต Prompt ให้เป็นข้อความล่าสุดเสมอ
// ฟังก์ชันสำหรับอัปเดต Prompt ให้เป็นข้อความล่าสุดเสมอ
function updateExtensionPrompt() {
    try {
        console.log(`[${extensionName}] 🔄 กำลังเตรียมอัปเดต Prompt...`);

        const promptString = generateStatusPrompt(); // ดึงข้อความสถานะล่าสุดมา

        if (!promptString) {
            console.log(`[${extensionName}] ⚠️ ข้ามการอัปเดต: ไม่มีข้อมูลสถานะ`);
            return;
        }

        console.log(`[${extensionName}] 📨 ข้อความที่จะส่งให้ AI: \n${promptString}`);

        // ส่งข้อความเข้าสู่ระบบของ SillyTavern
        setExtensionPrompt(
            extensionName,
            promptString,
            0, // IN_PROMPT
            1, // ความสำคัญ
            true,
            0  // SYSTEM ROLE
        );

        console.log(`[${extensionName}] ✅ ลงทะเบียน Prompt สำเร็จ!`);
    } catch (error) {
        // ถ้ามี Error (เช่น หาคำสั่ง setExtensionPrompt ไม่เจอ) มันจะฟ้องสีแดงตรงนี้ครับ!
        console.error(`[${extensionName}] ❌ เกิดข้อผิดพลาดในการอัปเดต Prompt:`, error);
    }
}

// สั่งให้ Extension เริ่มทำงาน
jQuery(async () => {
    await initExtension();
});
