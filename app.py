from flask import Flask, render_template, request, jsonify, send_from_directory
import json
import os
import uuid
from datetime import datetime

app = Flask(__name__)

# Пути к файлам для хранения данных
TASKS_FILE = 'tasks.json'
ARCHIVED_TASKS_FILE = 'archived_tasks.json'
CATEGORIES_FILE = 'categories.json'
UPLOAD_FOLDER = 'task_files'

# Инициализация данных
def load_data(file_path, default):
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
        else:
            save_data(file_path, default)
            return default
    except Exception as e:
        print(f"Ошибка загрузки {file_path}: {e}")
        return default

def save_data(file_path, data):
    try:
        with open(file_path, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Ошибка сохранения {file_path}: {e}")

# Инициализация файлов, если они отсутствуют
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

if not os.path.exists(TASKS_FILE):
    save_data(TASKS_FILE, [])
if not os.path.exists(ARCHIVED_TASKS_FILE):
    save_data(ARCHIVED_TASKS_FILE, [])
if not os.path.exists(CATEGORIES_FILE):
    save_data(CATEGORIES_FILE, ['Работа', 'Личное', 'Покупки'])

tasks = load_data(TASKS_FILE, [])
archived_tasks = load_data(ARCHIVED_TASKS_FILE, [])
categories = load_data(CATEGORIES_FILE, ['Работа', 'Личное', 'Покупки'])

# Маршруты API
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/calendar')
def calendar():
    return render_template('calendar.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    return jsonify({'tasks': tasks, 'archived_tasks': archived_tasks})

@app.route('/api/tasks', methods=['POST'])
def add_task():
    try:
        task = request.json
        if not task or not task.get('text'):
            return jsonify({'error': 'Текст задачи обязателен'}), 400
        
        task['id'] = max([t['id'] for t in tasks], default=0) + 1
        task.setdefault('completed', False)
        task.setdefault('description', '')
        task.setdefault('category', categories[0] if categories else 'Без категории')
        task.setdefault('datetime', None)
        task.setdefault('parent_id', None)
        task.setdefault('dependencies', [])
        task.setdefault('files', [])
        
        # Проверки зависимостей
        if task['parent_id'] and not any(t['id'] == task['parent_id'] for t in tasks):
            return jsonify({'error': f'Родительская задача с ID {task["parent_id"]} не найдена'}), 400
            
        for dep_id in task['dependencies']:
            if not any(t['id'] == dep_id for t in tasks):
                return jsonify({'error': f'Зависимость с ID {dep_id} не найдена'}), 400
        
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
        task = next((t for t in tasks if t['id'] == task_id), None)
        if not task:
            return jsonify({'error': 'Задача не найдена'}), 404
            
        # Обновляем только разрешенные поля
        allowed_fields = ['text', 'datetime', 'description', 'category', 'completed', 'parent_id', 'dependencies']
        for field in allowed_fields:
            if field in task_data:
                task[field] = task_data[field]
        
        # Проверки зависимостей
        if 'dependencies' in task_data:
            for dep_id in task_data['dependencies']:
                if not any(t['id'] == dep_id for t in tasks):
                    return jsonify({'error': f'Зависимость с ID {dep_id} не найдена'}), 400
        
        save_data(TASKS_FILE, tasks)
        return jsonify(task)
    except Exception as e:
        print(f"Ошибка при обновлении задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        global tasks
        def remove_subtasks(task_id_to_remove):
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
        archived_tasks = [t for t in archived_tasks if t['id'] != task_id]
        save_data(ARCHIVED_TASKS_FILE, archived_tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при удалении архивной задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/archive', methods=['POST'])
def archive_completed():
    try:
        global tasks, archived_tasks
        # Собираем все задачи с подзадачами
        def get_all_subtasks(task_id):
            subtasks = [t for t in tasks if t.get('parent_id') == task_id]
            result = []
            for subtask in subtasks:
                result.append(subtask)
                result.extend(get_all_subtasks(subtask['id']))
            return result

        completed_tasks = []
        for task in tasks[:]:  # Копируем список
            if task['completed']:
                completed_tasks.append(task)
                completed_tasks.extend(get_all_subtasks(task['id']))
        tasks = [t for t in tasks if not t['completed'] and t.get('parent_id') not in [ct['id'] for ct in completed_tasks]]
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
        category = request.json.get('category')
        if not category:
            return jsonify({'error': 'Название категории обязательно'}), 400
        if category in categories:
            return jsonify({'error': 'Категория уже существует'}), 400
        categories.append(category)
        save_data(CATEGORIES_FILE, categories)
        return jsonify({'success': True, 'category': category}), 201
    except Exception as e:
        print(f"Ошибка при добавлении категории: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/<category>', methods=['DELETE'])
def delete_category(category):
    try:
        if any(task['category'] == category for task in tasks):
            return jsonify({'error': 'Нельзя удалить категорию с задачами'}), 400
        if category in categories:
            categories.remove(category)
            save_data(CATEGORIES_FILE, categories)
            return jsonify({'success': True})
        return jsonify({'error': 'Категория не найдена'}), 404
    except Exception as e:
        print(f"Ошибка при удалении категории: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/categories/reorder', methods=['POST'])
def reorder_categories():
    try:
        new_order = request.json.get('categories')
        if not new_order or not isinstance(new_order, list):
            return jsonify({'error': 'Неверный формат данных'}), 400
        global categories
        categories = new_order
        save_data(CATEGORIES_FILE, categories)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при переупорядочивании категорий: {e}")
        return jsonify({'error': str(e)}), 500

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
        tasks = [
            {
                'id': t.get('id', max([task['id'] for task in tasks], default=0) + 1),
                'text': t.get('text', ''),
                'category': t.get('category', categories[0]) if categories and t.get('category') in categories else categories[0] if categories else 'Без категории',
                'datetime': t.get('datetime', None),
                'description': t.get('description', ''),
                'completed': t.get('completed', False),
                'parent_id': t.get('parent_id', None),
                'dependencies': t.get('dependencies', []),
                'files': t.get('files', [])
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
        
        # Генерируем уникальное имя файла
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
        # Проверяем, что все зависимости и подзадачи завершены
        can_complete = all(t['completed'] for t in tasks if t['id'] in task.get('dependencies', []))
        # Проверяем подзадачи
        subtasks = [t for t in tasks if t.get('parent_id') == task_id]
        can_complete = can_complete and all(t['completed'] for t in subtasks)
        return jsonify({'can_complete': can_complete})
    except Exception as e:
        print(f"Ошибка при проверке возможности завершения задачи: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
