import { debounce } from './utils.js';

export async function initializeContacts() {
    await fetchUsers();
    renderContacts();
    setupContactEventListeners();
    await renderContactsForTask();
    await renderTaskGroups();
}

// Получение пользователей с сервера
async function fetchUsers() {
    try {
        const response = await fetch('/api/users', { timeout: 5000 });
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        window.users = await response.json();
        return window.users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        alert('Не удалось загрузить пользователей. Проверьте подключение к серверу.');
        return [];
    }
}

// Отрисовка списка контактов
function renderContacts() {
    const contactList = document.getElementById('contactList');
    if (!contactList) return;

    // Фильтрация контактов по поисковому запросу
    const filteredUsers = window.users.filter(user => {
        if (!window.contactSearchQuery) return true;
        const query = window.contactSearchQuery.toLowerCase();
        return (
            (user.name && user.name.toLowerCase().includes(query)) ||
            (user.username && user.username.toLowerCase().includes(query)) ||
            (user.group && user.group.toLowerCase().includes(query))
        );
    });

    // Сортировка контактов
    filteredUsers.sort((a, b) => {
        const aValue = a[window.contactSortField] || '';
        const bValue = b[window.contactSortField] || '';
        
        if (window.contactSortOrder === 'asc') {
            return aValue.localeCompare(bValue);
        } else {
            return bValue.localeCompare(aValue);
        }
    });

    // Генерация HTML
    contactList.innerHTML = `
        <thead>
            <tr>
                <th data-sort="name">Имя ${window.contactSortField === 'name' ? (window.contactSortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                <th data-sort="username">Username ${window.contactSortField === 'username' ? (window.contactSortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                <th data-sort="group">Группа ${window.contactSortField === 'group' ? (window.contactSortOrder === 'asc' ? '↑' : '↓') : ''}</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody>
            ${filteredUsers.map(user => `
                <tr class="contact-row" data-chatid="${user.chat_id}">
                    <td>
                        <span class="contact-name">${user.name || 'Не указано'}</span>
                        <input type="text" class="contact-name-input hidden" value="${user.name || ''}">
                    </td>
                    <td>${user.username || 'Не указано'}</td>
                    <td>${user.group || 'Не указана'}</td>
                    <td class="contact-actions">
                        <button class="edit-contact" data-chatid="${user.chat_id}">✏️</button>
                        <button class="delete-contact" data-chatid="${user.chat_id}">✕</button>
                    </td>
                </tr>
            `).join('')}
        </tbody>
    `;
}

// Настройка обработчиков событий
function setupContactEventListeners() {
    // Добавление контакта
    document.getElementById('addContactBtn')?.addEventListener('click', addContact);
    
    // Поиск контактов
    document.getElementById('contactSearch')?.addEventListener('input', debounce(() => {
        window.contactSearchQuery = document.getElementById('contactSearch').value.trim();
        renderContacts();
    }, 300));
    
    // Сортировка контактов
    document.querySelectorAll('[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (window.contactSortField === field) {
                window.contactSortOrder = window.contactSortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                window.contactSortField = field;
                window.contactSortOrder = 'asc';
            }
            renderContacts();
        });
    });
    
    // Редактирование имени контакта
    document.querySelectorAll('.contact-name').forEach(span => {
        span.addEventListener('click', (e) => {
            const row = e.target.closest('.contact-row');
            row.querySelector('.contact-name').classList.add('hidden');
            row.querySelector('.contact-name-input').classList.remove('hidden');
            row.querySelector('.contact-name-input').focus();
        });
    });
    
    // Сохранение имени контакта
    document.querySelectorAll('.contact-name-input').forEach(input => {
        input.addEventListener('blur', saveContactName);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') input.blur();
        });
    });
    
    // Открытие модального окна редактирования
    document.querySelectorAll('.edit-contact').forEach(btn => {
        btn.addEventListener('click', () => openEditContactModal(btn.dataset.chatid));
    });
    
    // Удаление контакта
    document.querySelectorAll('.delete-contact').forEach(btn => {
        btn.addEventListener('click', () => deleteContact(btn.dataset.chatid));
    });
}

// Добавление нового контакта
async function addContact() {
    const usernameInput = document.getElementById('addContactUsername');
    const username = usernameInput.value.trim();

    if (!username || !username.startsWith('@')) {
        alert('Username должен начинаться с @');
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при добавлении контакта');
        }

        usernameInput.value = '';
        await fetchUsers();
        renderContacts();
        await renderContactsForTask();
        await renderTaskGroups();
    } catch (error) {
        console.error('Ошибка при добавлении контакта:', error);
        alert(`Не удалось добавить контакт: ${error.message}`);
    }
}

// Сохранение имени контакта
async function saveContactName(e) {
    const input = e.target;
    const chatId = input.closest('.contact-row').dataset.chatid;
    const newName = input.value.trim();

    input.classList.add('hidden');
    const nameSpan = input.previousElementSibling;
    nameSpan.classList.remove('hidden');

    if (!newName) return;

    try {
        const response = await fetch(`/api/users/${chatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });

        if (!response.ok) throw new Error('Ошибка при сохранении имени');

        nameSpan.textContent = newName;
        await fetchUsers();
        await renderContactsForTask();
    } catch (error) {
        console.error('Ошибка при сохранении имени:', error);
        alert('Не удалось сохранить имя');
    }
}

// Открытие модального окна редактирования контакта
function openEditContactModal(chatId) {
    const user = window.users.find(u => u.chat_id == chatId);
    if (!user) return;

    window.currentEditChatId = chatId;
    
    document.getElementById('editContactName').value = user.name || '';
    document.getElementById('editContactUsername').value = user.username || '';
    document.getElementById('editContactGroup').value = user.group || '';
    
    // Настройка обработчиков для модального окна
    document.getElementById('saveContactEditBtn').onclick = saveContactChanges;
    document.getElementById('cancelContactEditBtn').onclick = closeEditContactModal;
    
    // Показ модального окна
    document.getElementById('editContactModal').classList.remove('hidden');
}

// Сохранение изменений контакта
async function saveContactChanges() {
    if (!window.currentEditChatId) return;

    const userData = {
        name: document.getElementById('editContactName').value.trim(),
        username: document.getElementById('editContactUsername').value.trim(),
        group: document.getElementById('editContactGroup').value.trim() || null
    };

    try {
        const response = await fetch(`/api/users/${window.currentEditChatId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при обновлении контакта');
        }

        closeEditContactModal();
        await fetchUsers();
        renderContacts();
        await renderContactsForTask();
        await renderTaskGroups();
    } catch (error) {
        console.error('Ошибка при обновлении контакта:', error);
        alert(`Не удалось обновить контакт: ${error.message}`);
    }
}

// Закрытие модального окна редактирования
function closeEditContactModal() {
    document.getElementById('editContactModal').classList.add('hidden');
    window.currentEditChatId = null;
}

// Удаление контакта
async function deleteContact(chatId) {
    if (!confirm('Вы уверены, что хотите удалить этот контакт?')) return;

    try {
        const response = await fetch(`/api/users/${chatId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при удалении контакта');
        }

        await fetchUsers();
        renderContacts();
        await renderContactsForTask();
        await renderTaskGroups();
    } catch (error) {
        console.error('Ошибка при удалении контакта:', error);
        alert(`Не удалось удалить контакт: ${error.message}`);
    }
}

// Отрисовка контактов в выпадающем списке для задач
async function renderContactsForTask() {
    await fetchUsers();
    const contactsSelect = document.getElementById('taskContacts');
    const editContactsSelect = document.getElementById('editTaskContacts');

    const options = window.users.map(user => 
        `<option value="${user.chat_id}">${user.name || 'Без имени'} (${user.username || 'нет username'})</option>`
    ).join('');

    if (contactsSelect) {
        contactsSelect.innerHTML = '<option value="">Выберите контакты</option>' + options;
    }

    if (editContactsSelect) {
        editContactsSelect.innerHTML = '<option value="">Выберите контакты</option>' + options;
    }
}

// Отрисовка групп в выпадающем списке для задач
async function renderTaskGroups() {
    await fetchUsers();
    const taskGroupSelect = document.getElementById('taskGroup');
    const editTaskGroupSelect = document.getElementById('editTaskGroup');
    
    const groups = [...new Set(window.users.map(user => user.group).filter(Boolean))];
    const options = groups.map(group => `<option value="${group}">${group}</option>`).join('');

    if (taskGroupSelect) {
        taskGroupSelect.innerHTML = '<option value="">Без группы</option>' + options;
    }

    if (editTaskGroupSelect) {
        editTaskGroupSelect.innerHTML = '<option value="">Без группы</option>' + options;
    }
}

// Фильтрация контактов в выпадающем списке
export function filterContacts(searchTerm, selectElementId) {
    const contactsSelect = document.getElementById(selectElementId);
    if (!contactsSelect) return;

    const options = Array.from(contactsSelect.options).slice(1);
    const searchLower = searchTerm.toLowerCase().trim();

    options.forEach(option => {
        const optionText = option.text.toLowerCase();
        const matchesSearch = searchLower ? optionText.includes(searchLower) : true;
        
        option.hidden = !matchesSearch;
        option.innerHTML = matchesSearch && searchTerm.trim() ? 
            option.text.replace(new RegExp(`(${searchTerm})`, 'gi'), '<mark>$1</mark>') : 
            option.text;
    });

    const firstVisible = options.find(opt => !opt.hidden);
    if (firstVisible) {
        firstVisible.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}