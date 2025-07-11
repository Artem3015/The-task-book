from flask import Flask, render_template, request, jsonify
import json
import os

app = Flask(__name__)

# Путь к файлам для хранения данных
TASKS_FILE = 'tasks.json'
ARCHIVED_TASKS_FILE = 'archived_tasks.json'
CATEGORIES_FILE = 'categories.json'

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
        task['completed'] = task.get('completed', False)
        task['description'] = task.get('description', '')
        task['category'] = task.get('category', categories[0]) if categories else 'Без категории'
        task['datetime'] = task.get('datetime', None)
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
        for task in tasks:
            if task['id'] == task_id:
                task.update(task_data)
                save_data(TASKS_FILE, tasks)
                return jsonify(task)
        return jsonify({'error': 'Задача не найдена'}), 404
    except Exception as e:
        print(f"Ошибка при обновлении задачи: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    try:
        global tasks
        tasks = [t for t in tasks if t['id'] != task_id]
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
        completed_tasks = [t for t in tasks if t['completed']]
        tasks = [t for t in tasks if not t['completed']]
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
                'completed': t.get('completed', False)
            } for t in uploaded_tasks
        ]
        save_data(TASKS_FILE, tasks)
        return jsonify({'success': True})
    except Exception as e:
        print(f"Ошибка при загрузке задач: {e}")
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True)