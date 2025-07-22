from flask import Flask, render_template, request, jsonify, send_from_directory, redirect, url_for
import json
import os
import uuid
from datetime import datetime, timedelta
import urllib.parse
from telegram_service import TelegramService  

app = Flask(__name__)

# Инициализация TelegramService
telegram_service = None
if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    try:
        telegram_service = TelegramService()
        telegram_service.start_reminder_thread()
    except Exception as e:
        print(f"Ошибка инициализации TelegramService: {e}")

# Пути к файлам
TASKS_FILE = 'tasks.json'
ARCHIVED_TASKS_FILE = 'archived_tasks.json'
CATEGORIES_FILE = 'categories.json'
USERS_FILE = 'users.json'
UPLOAD_FOLDER = 'task_files'

# Инициализация данных
def load_data(file_path, default):
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                print(f"Загружено из {file_path}: {data}")  # Отладка: вывод содержимого файла
                if file_path == TASKS_FILE:
                    print(f"Задачи без даты в {file_path}: {[t for t in data if not t.get('datetime')]}")  # Отладка
                return data
        else:
            print(f"Файл {file_path} не существует, создаём с данными по умолчанию: {default}")  # Отладка
            save_data(file_path, default)
            return default
    except Exception as e:
        print(f"Ошибка загрузки {file_path}: {e}")
        return default

def save_data(file_path, data):
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Ошибка сохранения {file_path}: {e}")

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

if not os.path.exists(TASKS_FILE):
    save_data(TASKS_FILE, [])
if not os.path.exists(ARCHIVED_TASKS_FILE):
    save_data(ARCHIVED_TASKS_FILE, [])
if not os.path.exists(CATEGORIES_FILE):
    save_data(CATEGORIES_FILE, [])
if not os.path.exists(USERS_FILE):
    save_data(USERS_FILE, [])

tasks = load_data(TASKS_FILE, [])
archived_tasks = load_data(ARCHIVED_TASKS_FILE, [])
categories = load_data(CATEGORIES_FILE, [])
users = load_data(USERS_FILE, [])

# Маршруты
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calendar')
def calendar():
    return render_template('calendar.html')

@app.route('/contacts')
def contacts():
    return render_template('contacts.html')

@app.route('/static/script.js')
def redirect_script_js():
    return redirect(url_for('static', filename='js/main.js'), code=301)

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    tasks = load_data(TASKS_FILE, [])
    archived_tasks = load_data(ARCHIVED_TASKS_FILE, [])
    print('Все задачи:', tasks)  # Отладка: вывод всех задач
    print('Задачи без даты:', [t for t in tasks if not t.get('datetime')])  # Отладка
    print('Архивные задачи:', archived_tasks)  # Отладка
    return jsonify({'tasks': tasks, 'archived_tasks': archived_tasks})

@app.route('/api/tasks', methods=['POST'])
def add_task():
    try:
        task = request.json
        
        # Конвертация chat_id в chat_ids для обратной совместимости
        if 'chat_id' in task:
            if task['chat_id']:
                task['chat_ids'] = [task['chat_id']]
            del task['chat_id']
        
        # Установка значений по умолчанию
        task.setdefault('chat_ids', [])
        task.setdefault('reminder_time', None)
        task.setdefault('group', None)
        task.setdefault('repeat_interval', None)
        task.setdefault('repeat_count', None)
        task.setdefault('repeat_until', None)
        task.setdefault('original_task_id', None)
        
        if not task or not task.get('text'):
            return jsonify({'error': 'Текст задачи обязателен'}), 400
        
        # Проверка chat_ids
        if task.get('chat_ids'):
            for cid in task['chat_ids']:
                if not any(u['chat_id'] == cid for u in users):
                    return jsonify({'error': f'Контакт с chat_id {cid} не найден'}), 400
        
        task['id'] = max([t['id'] for t in tasks], default=0) + 1
        task.setdefault('completed', False)
        task.setdefault('description', '')
        task.setdefault('category', categories[0]['name'] if categories else 'Без категории')
        task.setdefault('datetime', None)
        task.setdefault('parent_id', None)
        task.setdefault('dependencies', [])
        task.setdefault('files', [])
        
        if task.get('parent_id'):
            parent_exists = any(t['id'] == task['parent_id'] for t in tasks)
            if not parent_exists:
                return jsonify({'error': f'Родительская задача с ID {task["parent_id"]} не найдена'}), 400

        for dep_id in task['dependencies']:
            if not any(t['id'] == dep_id for t in tasks):
                return jsonify({'error': f'Зависимость с ID {dep_id} не найдена'}), 400
        
        if task.get('group') and not any(u['group'] == task['group'] for u in users):
            return jsonify({'error': f'Группа {task["group"]} не найдена в контактах'}), 400
        
        if task.get('category') and not any(cat['name'] == task['category'] for cat in categories):
            return jsonify({'error': f'Категория {task["category"]} не найдена'}), 400
        
        tasks.append(task)
        save_data(TASKS_FILE, tasks)
        return jsonify(task), 201
    except Exception as e:
        print(f"Ошибка при добавлении задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    try:
        task_data = request.json
        tasks_list = list(tasks) if isinstance(tasks, tuple) else tasks
        
        task = next((t for t in tasks_list if t['id'] == task_id), None)
        if not task:
            return jsonify({'error': 'Задача не найдена'}), 404

        # Создаем копию задачи для изменений
        task_copy = dict(task)
        
        # Обработка chat_id/chat_ids
        if 'chat_id' in task_data:
            task_data['chat_ids'] = [int(task_data['chat_id'])] if task_data['chat_id'] else []
            del task_data['chat_id']
        elif 'chat_ids' in task_data:
            task_data['chat_ids'] = [int(cid) for cid in task_data['chat_ids'] if cid]
            
        allowed_fields = ['text', 'datetime', 'reminder_time', 'description', 'category', 
                 'completed', 'parent_id', 'dependencies', 'chat_ids', 'group',
                 'repeat_interval', 'repeat_count', 'repeat_until']
        
        # Обновляем только разрешенные поля
        for field in allowed_fields:
            if field in task_data:
                if field == 'chat_ids':
                    # Проверяем каждый chat_id в списке
                    for cid in task_data['chat_ids']:
                        if not any(u['chat_id'] == cid for u in users):
                            return jsonify({
                                'error': f'Контакт с chat_id {cid} не найден',
                                'available_users': [u['chat_id'] for u in users]
                            }), 400
                elif field == 'group' and task_data['group']:
                    if not any(u['group'] == task_data['group'] for u in users):
                        return jsonify({
                            'error': f'Группа {task_data["group"]} не найдена',
                            'available_groups': list(set(u['group'] for u in users if u['group']))
                        }), 400
                elif field == 'category' and task_data['category']:
                    if not any(cat['name'] == task_data['category'] for cat in categories):
                        return jsonify({
                            'error': f'Категория {task_data["category"]} не найдена',
                            'available_categories': [cat['name'] for cat in categories]
                        }), 400
                elif field == 'dependencies':
                    for dep_id in task_data['dependencies']:
                        if not any(t['id'] == dep_id for t in tasks_list):
                            return jsonify({
                                'error': f'Зависимость с ID {dep_id} не найдена',
                                'available_tasks': [t['id'] for t in tasks_list]
                            }), 400
                
                task_copy[field] = task_data[field]
        
        # Обновляем оригинальную задачу в списке
        for i, t in enumerate(tasks_list):
            if t['id'] == task_id:
                tasks_list[i] = task_copy
                break
                
        save_data(TASKS_FILE, tasks_list)
        return jsonify(task_copy)
    except ValueError as e:
        print(f"Ошибка преобразования типов: {e}")
        return jsonify({
            'error': 'Некорректный формат данных',
            'details': str(e)
        }), 400
    except Exception as e:
        print(f"Ошибка при обновлении задачи: {e}")
        return jsonify({
            'error': 'Внутренняя ошибка сервера',
            'details': str(e)
        }), 500

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        global tasks
        def remove_subtasks(task_id_to_remove):
            global tasks
            tasks[:] = [t for t in tasks if t['id'] != task_id_to_remove]
            for task in tasks[:]:
                if task.get('parent_id') == task_id_to_remove:
                    remove_subtasks(task['id'])
        remove_subtasks(task_id)
        save_data(TASKS_FILE, tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при удалении задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/archive/<int:task_id>', methods=['DELETE'])
def delete_archived_task(task_id):
    try:
        global archived_tasks
        archived_tasks[:] = [t for t in archived_tasks if t['id'] != task_id]
        save_data(ARCHIVED_TASKS_FILE, archived_tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при удалении архивной задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/archive', methods=['POST'])
def archive_completed():
    try:
        global tasks, archived_tasks
        def get_all_subtasks(task_id):
            subtasks = [t for t in tasks if t.get('parent_id') == task_id]
            result = []
            for subtask in subtasks:
                result.append(subtask)
                result.extend(get_all_subtasks(subtask['id']))
            return result

        completed_tasks = []
        for task in tasks[:]:
            if task['completed']:
                completed_tasks.append(task)
                completed_tasks.extend(get_all_subtasks(task['id']))
        tasks[:] = [t for t in tasks if not t['completed'] and t.get('parent_id') not in [ct['id'] for ct in completed_tasks]]
        archived_tasks.extend(completed_tasks)
        save_data(TASKS_FILE, tasks)
        save_data(ARCHIVED_TASKS_FILE, archived_tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при архивировании задач: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories', methods=['GET'])
def get_categories():
    return jsonify(categories)

@app.route('/api/categories', methods=['POST'])
def add_category():
    try:
        global categories
        category = request.json
        print(f"Получен запрос на добавление категории: {category}")
        if not category.get('name'):
            return jsonify({'error': 'Название категории обязательно'}), 400
        color = category.get('color') if category.get('color') else None
        if color and (not color.startswith('#') or len(color) not in [4, 7]):
            return jsonify({'error': 'Неверный формат цвета (должен быть HEX, например #FFF или #FFFFFF)'}), 400
        if any(cat['name'] == category['name'] for cat in categories):
            return jsonify({'error': f'Категория "{category["name"]}" уже существует'}), 400
        new_category = {'name': category['name'], 'color': color}
        categories.append(new_category)
        try:
            save_data(CATEGORIES_FILE, categories)
            print(f"Категория {new_category['name']} успешно сохранена")
        except Exception as e:
            print(f"Ошибка при сохранении categories.json: {e}")
            return jsonify({'error': 'Ошибка сохранения категории на сервере'}), 500
        return jsonify({'success': True, 'category': new_category}), 201
    except Exception as e:
        print(f"Ошибка при добавлении категории: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category>', methods=['PUT'])
def update_category(category):
    try:
        global categories, tasks
        category = urllib.parse.unquote(category)
        category_data = request.json
        print(f"Получен запрос на обновление категории: {category_data}")
        if not category_data.get('name'):
            return jsonify({'error': 'Название категории обязательно'}), 400
        color = category_data.get('color') if category_data.get('color') else None
        if color and (not color.startswith('#') or len(color) not in [4, 7]):
            return jsonify({'error': 'Неверный формат цвета (должен быть HEX, например #FFF или #FFFFFF)'}), 400
        if any(cat['name'] == category_data['name'] and cat['name'] != category for cat in categories):
            return jsonify({'error': f'Категория "{category_data["name"]}" уже существует'}), 400
        
        category_obj = next((cat for cat in categories if cat['name'] == category), None)
        if not category_obj:
            return jsonify({'error': 'Категория не найдена'}), 404
        
        old_name = category_obj['name']
        category_obj['name'] = category_data['name']
        category_obj['color'] = color
        
        for task in tasks:
            if task['category'] == old_name:
                task['category'] = category_data['name']
        
        save_data(CATEGORIES_FILE, categories)
        save_data(TASKS_FILE, tasks)
        return jsonify({'success': True, 'category': category_obj})
    except Exception as e:
        print(f"Ошибка при обновлении категории: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category>', methods=['DELETE'])
def delete_category(category):
    try:
        global categories
        category = urllib.parse.unquote(category)
        if any(task['category'] == category for task in tasks):
            return jsonify({'error': 'Нельзя удалить категорию, связанную с задачами'}), 400
        category_obj = next((cat for cat in categories if cat['name'] == category), None)
        if not category_obj:
            return jsonify({'error': 'Категория не найдена'}), 404
        categories[:] = [cat for cat in categories if cat['name'] != category]
        save_data(CATEGORIES_FILE, categories)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при удалении категории: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/reorder', methods=['POST'])
def reorder_categories():
    try:
        global categories
        new_order = request.json.get('categories')
        if not new_order or not isinstance(new_order, list):
            return jsonify({'error': 'Неверный формат данных'}), 400
        categories[:] = new_order
        save_data(CATEGORIES_FILE, categories)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при переупорядочивании категорий: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['GET'])
def get_users():
    try:
        global users
        users = load_data(USERS_FILE, [])
        print(f"Returning users: {users}")
        return jsonify(users)
    except Exception as e:
        print(f"Error in /api/users: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['POST'])
def add_user():
    try:
        user_data = request.json
        username = user_data.get('username')
        if not username or not username.startswith('@'):
            return jsonify({'error': 'Username должен начинаться с @'}), 400
        
        global users
        users = load_data(USERS_FILE, [])
        if any(u['username'] == username for u in users):
            return jsonify({'error': 'Пользователь с таким username уже существует'}), 400
        
        user_info = telegram_service.get_chat_id_by_username(username) if telegram_service else None
        if not user_info or not user_info.get('chat_id'):
            return jsonify({'error': 'Пользователь не найден в Telegram или не взаимодействовал с ботом'}), 404
        
        user = {
            'chat_id': user_info['chat_id'],
            'name': user_info.get('name', username),
            'username': username,
            'group': user_data.get('group', '')
        }
        users.append(user)
        save_data(USERS_FILE, users)
        return jsonify(user), 201
    except Exception as e:
        print(f"Ошибка при добавлении пользователя: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:chat_id>', methods=['PUT'])
def update_user(chat_id):
    try:
        user_data = request.json
        global users
        users = load_data(USERS_FILE, [])
        user = next((u for u in users if u['chat_id'] == chat_id), None)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        allowed_fields = ['name', 'group']
        for field in allowed_fields:
            if field in user_data:
                user[field] = user_data[field]
        
        save_data(USERS_FILE, users)
        return jsonify(user)
    except Exception as e:
        print(f"Ошибка при обновлении пользователя: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:chat_id>', methods=['DELETE'])
def delete_user(chat_id):
    try:
        global users
        users = load_data(USERS_FILE, [])
        user = next((u for u in users if u['chat_id'] == chat_id), None)
        if not user:
            return jsonify({'error': 'Пользователь не найден'}), 404
        
        users[:] = [u for u in users if u['chat_id'] != chat_id]
        save_data(USERS_FILE, users)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при удалении пользователя: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/stats')
def tasks_stats():
    now = datetime.now()
    total = len(tasks)
    completed = len([t for t in tasks if t.get('completed')])
    overdue = len([t for t in tasks if t.get('datetime') and 
                  datetime.fromisoformat(t['datetime']) < now and 
                  not t.get('completed')])
    
    return jsonify({
        "total": total,
        "completed": completed,
        "overdue": overdue
    })

@app.route('/api/tags')
def get_tags():
    return jsonify([])

@app.route('/api/tasks/<int:task_id>/subtasks')
def get_subtasks(task_id):
    subtasks = [t for t in tasks if t.get('parent_id') == task_id]
    return jsonify(subtasks)

@app.route('/api/tasks/upload', methods=['POST'])
def upload_tasks():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'Файл не предоставлен'}), 400
        file = request.files['file']
        uploaded_tasks = json.load(file)
        if not isinstance(uploaded_tasks, list):
            return jsonify({'error': 'Неверный формат файла'}), 400
        global tasks
        tasks[:] = [
            {
                'id': t.get('id', max([task['id'] for task in tasks], default=0) + 1),
                'text': t.get('text', ''),
                'category': t.get('category', categories[0]['name']) if categories and any(cat['name'] == t.get('category') for cat in categories) else categories[0]['name'] if categories else 'Без категории',
                'datetime': t.get('datetime', None),
                'reminder_time': t.get('reminder_time', None),
                'description': t.get('description', ''),
                'completed': t.get('completed', False),
                'parent_id': t.get('parent_id', None),
                'dependencies': t.get('dependencies', []),
                'files': t.get('files', []),
                'chat_ids': t.get('chat_ids', []),
                'group': t.get('group', None) if any(u['group'] == t.get('group') for u in users) else None
            } for t in uploaded_tasks
        ]
        save_data(TASKS_FILE, tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при загрузке задач: {e}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/tasks/<int:task_id>/files', methods=['GET'])
def get_task_files(task_id):
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Задача не найдена'}), 404
    return jsonify(task.get('files', []))

@app.route('/api/tasks/<int:task_id>/files', methods=['POST'])
def upload_task_file(task_id):
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Задача не найдена'}), 404
    
    if 'files' not in request.files:
        return jsonify({'error': 'Файл не предоставлен'}), 400
    
    uploaded_files = request.files.getlist('files')
    if not uploaded_files or not any(f.filename for f in uploaded_files):
        return jsonify({'error': 'Файл не предоставлен'}), 400
    
    if 'files' not in task:
        task['files'] = []
    
    new_files = []
    for file in uploaded_files:
        if not file.filename:
            continue
        
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(UPLOAD_FOLDER, unique_filename)
        
        file.save(file_path)
        
        file_info = {
            'id': str(uuid.uuid4()),
            'name': file.filename,
            'path': unique_filename,
            'size': os.path.getsize(file_path),
            'uploaded_at': datetime.now().isoformat()
        }
        
        task['files'].append(file_info)
        new_files.append(file_info)
    
    save_data(TASKS_FILE, tasks)
    return jsonify(new_files), 201

@app.route('/api/tasks/<int:task_id>/files/<file_id>', methods=['GET'])
def download_task_file(task_id, file_id):
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Задача не найдена'}), 404
    
    file_info = next((f for f in task.get('files', []) if f['id'] == file_id), None)
    if not file_info:
        return jsonify({'error': 'Файл не найден'}), 404
    
    try:
        if not os.path.exists(os.path.join(UPLOAD_FOLDER, file_info['path'])):
            return jsonify({'error': 'Файл не найден на сервере'}), 404
            
        return send_from_directory(
            UPLOAD_FOLDER, 
            file_info['path'], 
            as_attachment=True, 
            download_name=file_info['name']
        )
    except Exception as e:
        print(f"Ошибка при скачивании файла: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>/files/<file_id>', methods=['DELETE'])
def delete_task_file(task_id, file_id):
    task = next((t for t in tasks if t['id'] == task_id), None)
    if not task:
        return jsonify({'error': 'Задача не найдена'}), 404
    
    file_info = next((f for f in task.get('files', []) if f['id'] == file_id), None)
    if not file_info:
        return jsonify({'error': 'Файл не найден'}), 404
    
    try:
        file_path = os.path.join(UPLOAD_FOLDER, file_info['path'])
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError as e:
        print(f"Ошибка при удалении файла: {e}")
    
    task['files'] = [f for f in task['files'] if f['id'] != file_id]
    save_data(TASKS_FILE, tasks)
    
    return jsonify({'success': True})

@app.route('/api/tasks/<int:task_id>/can_complete', methods=['GET'])
def can_complete_task(task_id):
    try:
        task = next((t for t in tasks if t['id'] == task_id), None)
        if not task:
            return jsonify({'error': 'Задача не найдена'}), 404
        can_complete = all(t['completed'] for t in tasks if t['id'] in task.get('dependencies', []))
        subtasks = [t for t in tasks if t.get('parent_id') == task_id]
        can_complete = can_complete and all(t['completed'] for t in subtasks)
        return jsonify({'can_complete': can_complete})
    except Exception as e:
        print(f"Ошибка при проверке возможности завершения задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:chat_id>/tasks', methods=['GET'])
def get_user_tasks(chat_id):
    try:
        now = datetime.now()
        week_later = now + timedelta(days=7)
        
        user_tasks = []
        for task in tasks:
            # Пропускаем только завершенные задачи
            if task.get('completed'):
                continue
                
            # Проверяем принадлежность задачи пользователю
            is_user_task = (chat_id in task.get('chat_ids', []) or 
                          (task.get('group') and 
                           any(u['chat_id'] == chat_id and u.get('group') == task['group'] for u in users)))
            
            if not is_user_task:
                continue
                
            # Для задач с датой проверяем период
            if task.get('datetime'):
                try:
                    task_time = datetime.fromisoformat(task['datetime'])
                    if now <= task_time <= week_later:
                        user_tasks.append(task)
                except ValueError:
                    # Если дата в неправильном формате, добавляем без проверки
                    user_tasks.append(task)
            else:
                # Задачи без даты добавляем всегда
                user_tasks.append(task)
        
        # Сортируем задачи: сначала с ближайшими датами, потом без дат
        user_tasks.sort(key=lambda x: x.get('datetime') or '9999-12-31')
        
        return jsonify(user_tasks)
    except Exception as e:
        print(f"Ошибка при получении задач пользователя: {e}")
        return jsonify({'error': str(e)}), 500

@app.after_request
def add_header(response):
    if request.path.startswith('/static/js/'):
        response.headers['Content-Type'] = 'application/javascript'
    return response

@app.route('/api/tasks/process_repeating', methods=['POST'])
def process_repeating_tasks():
    try:
        global tasks
        now = datetime.now()
        new_tasks = []
        
        for task in tasks[:]:
            if task.get('completed') and task.get('repeat_interval'):
                last_occurrence = datetime.fromisoformat(task['datetime']) if task['datetime'] else None
                if not last_occurrence:
                    continue
                    
                should_repeat = False
                next_date = None
                if task['repeat_interval'] == 'day':
                    next_date = last_occurrence + timedelta(days=1)
                    should_repeat = next_date <= now
                elif task['repeat_interval'] == 'week':
                    next_date = last_occurrence + timedelta(weeks=1)
                    should_repeat = next_date <= now
                elif task['repeat_interval'] == 'month':
                    next_date = last_occurrence.replace(month=last_occurrence.month % 12 + 1, year=last_occurrence.year + (last_occurrence.month // 12))
                    should_repeat = next_date <= now
                elif task['repeat_interval'] == 'quarter':
                    next_date = last_occurrence.replace(month=last_occurrence.month % 12 + 3, year=last_occurrence.year + ((last_occurrence.month + 2) // 12))
                    should_repeat = next_date <= now
                elif task['repeat_interval'] == 'year':
                    next_date = last_occurrence.replace(year=last_occurrence.year + 1)
                    should_repeat = next_date <= now
                
                if should_repeat:
                    if task.get('repeat_until'):
                        repeat_until = datetime.fromisoformat(task['repeat_until'])
                        should_repeat = next_date <= repeat_until
                    
                    if should_repeat and task.get('repeat_count'):
                        original_task_id = task.get('original_task_id', task['id'])
                        completed_repeats = len([t for t in tasks if t.get('original_task_id') == original_task_id])
                        should_repeat = completed_repeats < task['repeat_count']
                
                if should_repeat:
                    new_task = task.copy()
                    new_task['id'] = max([t['id'] for t in tasks], default=0) + 1
                    new_task['completed'] = False
                    new_task['datetime'] = next_date.isoformat()
                    new_task['original_task_id'] = task.get('original_task_id', task['id'])
                    
                    if 'repeat_count' in new_task:
                        del new_task['repeat_count']
                    if 'repeat_until' in new_task:
                        del new_task['repeat_until']
                    
                    new_tasks.append(new_task)
        
        if new_tasks:
            tasks.extend(new_tasks)
            save_data(TASKS_FILE, tasks)
        
        return jsonify({'success': True, 'created': len(new_tasks)})
    except Exception as e:
        print(f"Ошибка при обработке повторяющихся задач: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False)