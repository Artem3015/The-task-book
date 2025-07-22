// Форматирование даты и времени
export function formatDateTime(dateString, options = {}) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const defaultOptions = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };

    const mergedOptions = { ...defaultOptions, ...options };
    return date.toLocaleString('ru-RU', mergedOptions);
}

// Форматирование времени в относительный вид (например, "2 часа назад")
export function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    const intervals = {
        год: 31536000,
        месяц: 2592000,
        неделя: 604800,
        день: 86400,
        час: 3600,
        минута: 60,
        секунда: 1
    };

    for (const [unit, seconds] of Object.entries(intervals)) {
        const interval = Math.floor(diffInSeconds / seconds);
        if (interval >= 1) {
            return `${interval} ${declension(interval, unit)} назад`;
        }
    }

    return 'только что';
}

// Склонение слов после числительных
function declension(number, word) {
    const cases = [2, 0, 1, 1, 1, 2];
    const variants = {
        год: ['года', 'лет', 'год'],
        месяц: ['месяца', 'месяцев', 'месяц'],
        неделя: ['недели', 'недель', 'неделя'],
        день: ['дня', 'дней', 'день'],
        час: ['часа', 'часов', 'час'],
        минута: ['минуты', 'минут', 'минута'],
        секунда: ['секунды', 'секунд', 'секунда']
    };

    if (variants[word]) {
        return variants[word][
            number % 100 > 4 && number % 100 < 20 
                ? 1 
                : cases[Math.min(number % 10, 5)]
        ];
    }
    return word;
}

// Функция для debounce
export function debounce(func, wait, immediate = false) {
    let timeout;
    return function executedFunction(...args) {
        const context = this;
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// Функция для throttle
export function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function(...args) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

// Экранирование спецсимволов для использования в регулярных выражениях
export function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Генерация уникального ID
export function generateId(prefix = '') {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
}

// Проверка, является ли значение объектом
export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Глубокая копия объекта
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (obj instanceof RegExp) return new RegExp(obj);
    
    const clone = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            clone[key] = deepClone(obj[key]);
        }
    }
    return clone;
}

// Слияние объектов
export function mergeObjects(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();

    if (isObject(target) && isObject(source)) {
        for (const key in source) {
            if (isObject(source[key])) {
                if (!target[key]) Object.assign(target, { [key]: {} });
                mergeObjects(target[key], source[key]);
            } else {
                Object.assign(target, { [key]: source[key] });
            }
        }
    }

    return mergeObjects(target, ...sources);
}

// Форматирование чисел (разделители тысяч)
export function formatNumber(number, decimals = 0) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(number);
}

// Преобразование строки в camelCase
export function toCamelCase(str) {
    return str.replace(/[-_\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '');
}

// Преобразование строки в kebab-case
export function toKebabCase(str) {
    return str.replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[\s_]+/g, '-')
        .toLowerCase();
}

// Проверка на пустое значение
export function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (isObject(value) && Object.keys(value).length === 0) return true;
    return false;
}

// Получение параметров из URL
export function getUrlParams() {
    return Object.fromEntries(new URLSearchParams(window.location.search));
}

// Установка параметров URL
export function setUrlParams(params) {
    const url = new URL(window.location);
    Object.entries(params).forEach(([key, value]) => {
        if (value === null || value === undefined) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    });
    window.history.pushState({}, '', url);
}

// Копирование текста в буфер обмена
export async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('Ошибка копирования в буфер обмена:', err);
        return false;
    }
}

// Подсветка текста в элементе
export function highlightText(element, text, options = {}) {
    if (!text || !element) return;

    const {
        tag = 'mark',
        className = 'highlight',
        caseSensitive = false
    } = options;

    const regex = new RegExp(escapeRegExp(text), caseSensitive ? 'g' : 'gi');
    const html = element.textContent.replace(regex, match => 
        `<${tag} class="${className}">${match}</${tag}>`
    );

    element.innerHTML = html;
}

// Получение типа файла по расширению
export function getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();
    const types = {
        image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
        archive: ['zip', 'rar', '7z', 'tar', 'gz'],
        audio: ['mp3', 'wav', 'ogg', 'aac'],
        video: ['mp4', 'avi', 'mov', 'mkv', 'webm']
    };

    for (const [type, exts] of Object.entries(types)) {
        if (exts.includes(extension)) return type;
    }
    return 'other';
}

// Форматирование размера файла
export function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

// Ограничение длины текста с добавлением многоточия
export function truncateText(text, maxLength = 100, ellipsis = '...') {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + ellipsis;
}

// Создание промиса с таймаутом
export function promiseWithTimeout(promise, timeout, errorMessage = 'Timeout exceeded') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeout);
        })
    ]);
}

// Генератор случайных чисел в диапазоне
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Проверка поддержки WebP
export async function checkWebPSupport() {
    if (!window.createImageBitmap) {
        console.warn('createImageBitmap не поддерживается в этом браузере');
        return false;
    }

    const webpData = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    try {
        const blob = await fetch(webpData).then(r => r.blob());
        const result = await createImageBitmap(blob);
        return true;
    } catch (error) {
        console.error('Ошибка проверки поддержки WebP:', error);
        return false;
    }
}