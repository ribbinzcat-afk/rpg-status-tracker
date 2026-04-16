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

    // (เพิ่มใหม่) ลงทะเบียนส่ง Prompt สถานะไปให้ AI แบบเงียบๆ
    // มันจะแอบแทรกข้อความนี้ไปที่ส่วนท้ายสุดของ System Prompt เสมอ
setExtensionPrompt(
        extensionName,
        generateStatusPrompt,
        extension_prompt_types.IN_PROMPT,
        1, // ความสำคัญ
        false,
        extension_prompt_roles.SYSTEM
    );
    
    console.log(`[${extensionName}] โหลดเสร็จสมบูรณ์!`);
}

// ฟังก์ชันสำหรับสร้างข้อความสถานะเพื่อส่งให้ AI
function generateStatusPrompt() {
    const settings = extension_settings[extensionName];
    const currentPresetKey = settings.currentPreset;
    const saveData = settings.saveData[currentPresetKey];
    const presetLayout = settings.presets[currentPresetKey];

    let promptText = "[System Note - Player Current Status]\n";

    // วนลูปอ่านข้อมูลทีละ Tab
    presetLayout.tabs.forEach(tab => {
        let tabData = [];
        tab.modules.forEach(module => {
            const val = saveData[module.id] !== undefined ? saveData[module.id] : module.default;

            if (module.type === "numeric") {
                // เช่น "HP: 100/100" หรือ "Gold: 500"
                let text = `${module.name.split(' ')[0]}: ${val}`;
                if (module.max !== undefined) text += `/${module.max}`;
                tabData.push(text);
            }
            else if (module.type === "complex") {
                // เช่น "Items: ดาบไม้(x1), โพชั่น(x3)"
                if (Array.isArray(val) && val.length > 0) {
                    const itemsText = val.map(item => `${item.name}(x${item.amount})`).join(', ');
                    tabData.push(`${module.name.split(' ')[0]}: ${itemsText}`);
                } else {
                    tabData.push(`${module.name.split(' ')[0]}: Empty`);
                }
            }
        });

        if (tabData.length > 0) {
            promptText += tabData.join(' | ') + "\n";
        }
    });

    return promptText.trim();
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

        const toggleContainer = document.createElement('div');
        toggleContainer.style.marginTop = '10px';
        toggleContainer.innerHTML = `
            <label class="checkbox_label">
                <input type="checkbox" id="rpg-toggle-floating-btn" ${settings.showFloatingButton ? 'checked' : ''}>
                <span>แสดงปุ่ม Status ที่เมนูด้านบน</span>
            </label>
        `;
        panelContainer.appendChild(toggleContainer);
        extensionPanel.appendChild(panelContainer);

        document.getElementById('rpg-toggle-floating-btn').addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            settings.showFloatingButton = isChecked;
            floatingBtn.style.display = isChecked ? 'inline-flex' : 'none';
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
        });

        // 4. ลบแท็ก <update> ออกจากหน้าแชท
        const cleanedText = text.replace(match[0], '').trim();
        lastMessage.mes = cleanedText;

        // 5. อัปเดตหน้าต่าง UI สถานะของเรา!
        renderUI();
        console.log(`[${extensionName}] ✅ อัปเดตสถานะและ UI เรียบร้อยแล้ว!`);

        // 6. บังคับรีเฟรชหน้าแชท 1 ครั้ง เพื่อให้ข้อความ <update> หายไปจากหน้าจอจริงๆ
        // (หน่วงเวลาเล็กน้อยเพื่อให้ระบบเซฟแชทเสร็จก่อน)
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

            tabContentHtml += `</div>`; // ปิด rpg-module-group
        });

        tabContentHtml += `</div>`; // ปิด rpg-tab-content
        contentContainer.append(tabContentHtml);
    });

    // 4. ผูก Event Listener ให้ปุ่ม Tab ที่เพิ่งสร้างใหม่
    $('.rpg-tab-btn').off('click').on('click', function() {
        $('.rpg-tab-btn').removeClass('active');
        $('.rpg-tab-content').removeClass('active');
        $(this).addClass('active');
        const targetId = $(this).data('target');
        $(`#${targetId}`).addClass('active');
    });
}

// สั่งให้ Extension เริ่มทำงาน
jQuery(async () => {
    await initExtension();
});
