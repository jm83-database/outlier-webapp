import os
from flask import Flask, render_template, request, session, jsonify, make_response
from flask_session import Session
import pandas as pd
import numpy as np
import json
from datetime import datetime
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.graph_objects as go
import plotly.express as px
from plotly.utils import PlotlyJSONEncoder
import io
import base64
from werkzeug.utils import secure_filename
import tempfile

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Session configuration for persistence
app.config['SESSION_PERMANENT'] = False
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = 7200  # 2 hours

# Initialize Flask-Session
Session(app)

# Static files configuration for better caching
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000  # 1 year for static files
app.config['TEMPLATES_AUTO_RELOAD'] = True

# Cache control for static files
@app.after_request
def add_header(response):
    """Add headers to both force latest IE rendering engine or Chrome Frame,
    and also tell the browser not to cache the rendered page."""
    response.headers['X-UA-Compatible'] = 'IE=Edge,chrome=1'
    
    # For static files, allow caching
    if request.endpoint and request.endpoint.startswith('static'):
        response.headers['Cache-Control'] = 'public, max-age=31536000'
    else:
        # For dynamic content, prevent caching
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    
    return response

# Allowed file extensions for upload
ALLOWED_EXTENSIONS = {'xlsx', 'xls', 'csv'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def clean_data_for_json(data):
    """None 값을 null로 변환하여 JSON 직렬화 문제 해결"""
    cleaned = {}
    for key, values in data.items():
        if key == 'No.':
            cleaned[key] = values
        else:
            cleaned[key] = [None if v is None or v == '' else v for v in values]
    return cleaned

def detect_outliers_with_threshold(arr, method='zscore', threshold=None):
    """다양한 방법으로 이상치 검출 (임계값 조정 가능)"""
    if len(arr) == 0:
        return np.array([], dtype=bool)
    
    if method == 'zscore':
        if threshold is None:
            threshold = 3.0
        mu, sigma = np.mean(arr), np.std(arr)
        if sigma == 0:
            return np.zeros(len(arr), dtype=bool)
        z = np.abs((arr - mu) / sigma)
        return z >= threshold
    
    elif method == 'iqr':
        if threshold is None:
            threshold = 1.5
        q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
        iqr = q3 - q1
        if iqr == 0:
            return np.zeros(len(arr), dtype=bool)
        lower, upper = q1 - threshold * iqr, q3 + threshold * iqr
        return (arr < lower) | (arr > upper)
    
    elif method == 'mad':
        if threshold is None:
            threshold = 3.5
        median = np.median(arr)
        mad = np.median(np.abs(arr - median))
        if mad == 0:
            return np.zeros(len(arr), dtype=bool)
        mz = 0.6745 * (arr - median) / mad
        return np.abs(mz) > threshold
    
    return np.zeros(len(arr), dtype=bool)

def create_scatter_plot(data, title="Scatter Plot", outlier_info=None):
    """산점도 생성"""
    if len(data) == 0:
        return None
    
    df = pd.DataFrame(data)
    
    fig = go.Figure()
    
    # 기본 데이터 포인트
    fig.add_trace(go.Scatter(
        x=df['Size(nm)'],
        y=df['PI'],
        mode='markers',
        marker=dict(
            size=8,
            color='rgba(55, 128, 191, 0.7)',
            line=dict(width=1, color='rgba(55, 128, 191, 1)')
        ),
        name='Data Points',
        text=[f"Point {i+1}<br>Size: {row['Size(nm)']:.3f}<br>PI: {row['PI']:.3f}" 
              for i, row in df.iterrows()],
        hovertemplate='%{text}<extra></extra>'
    ))
    
    fig.update_layout(
        title=title,
        xaxis_title='Size (nm)',
        yaxis_title='PI',
        hovermode='closest',
        width=600,
        height=400,
        margin=dict(l=60, r=30, t=60, b=60)
    )
    
    return json.dumps(fig, cls=PlotlyJSONEncoder)

@app.after_request
def after_request(response):
    # HTML 캐시 무효화
    if request.endpoint == 'index':
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.route('/')
def index():
    if 'datasets' not in session:
        session['datasets'] = {}
        session.modified = True
    
    if 'current_dataset' not in session:
        default_rows = 10
        session['current_dataset'] = {
            'sample_name': '',
            'production_date': datetime.now().strftime('%Y-%m-%d'),
            'pass_count': 1,
            'table_data': {
                'No.': list(range(1, default_rows + 1)),
                'Size(nm)': [None] * default_rows,
                'PI': [None] * default_rows
            },
            'pass_averages': []  # 패스별 평균값 저장
        }
        session.modified = True
    
    clean_table_data = clean_data_for_json(session['current_dataset']['table_data'])
    return render_template('index.html',
                         table_data=clean_table_data,
                         sample_name=session['current_dataset'].get('sample_name', ''),
                         production_date=session['current_dataset'].get('production_date', ''),
                         pass_count=session['current_dataset'].get('pass_count', 1),
                         saved_datasets=list(session['datasets'].keys()),
                         custom_data_field_name=session['current_dataset'].get('custom_data_field_name', '사용자 입력 필드(레퍼런스)'))

@app.route('/health')
def health():
    return {'status': 'healthy'}, 200

@app.route('/update_data', methods=['POST'])
def update_data():
    try:
        data = request.get_json()
        sample_name = data.get('sample_name', '')
        production_date = data.get('production_date', '')
        pass_count = data.get('pass_count', 1)
        table_data = data.get('table_data', {})
        
        # 데이터 정리
        for key in ['Size(nm)', 'PI']:
            if key in table_data:
                cleaned_values = []
                for v in table_data[key]:
                    if v is None or v == '' or (isinstance(v, str) and v.strip() == ''):
                        cleaned_values.append(None)
                    else:
                        try:
                            cleaned_values.append(float(v))
                        except (ValueError, TypeError):
                            cleaned_values.append(None)
                table_data[key] = cleaned_values
        
        # 패스 데이터 초기화 옵션 처리
        current_dataset = session.get('current_dataset', {})
        if data.get('clear_passes'):
            current_dataset['pass_averages'] = []
        
        session['current_dataset'] = {
            'sample_name': sample_name,
            'production_date': production_date,
            'pass_count': pass_count,
            'table_data': table_data,
            'pass_averages': current_dataset.get('pass_averages', []),
            'custom_data_field_name': current_dataset.get('custom_data_field_name', '사용자 입력 필드(레퍼런스)')
        }
        session.modified = True
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_row', methods=['POST'])
def add_row():
    try:
        table_data = session.get('current_dataset', {}).get('table_data', {'No.': [], 'Size(nm)': [], 'PI': []})
        new_no = len(table_data['No.']) + 1
        
        table_data['No.'].append(new_no)
        table_data['Size(nm)'].append(None)
        table_data['PI'].append(None)
        
        session['current_dataset']['table_data'] = table_data
        session.modified = True
        clean_table_data = clean_data_for_json(table_data)
        
        return jsonify({'status': 'success', 'table_data': clean_table_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_column', methods=['POST'])
def add_column():
    try:
        data = request.get_json()
        column_name = data.get('column_name', '').strip()
        
        if not column_name:
            return jsonify({'status': 'error', 'message': '컬럼 이름을 입력해주세요.'})
        
        table_data = session.get('current_dataset', {}).get('table_data', {})
        
        if column_name in table_data:
            return jsonify({'status': 'error', 'message': '이미 존재하는 컬럼명입니다.'})
        
        # 새 컬럼 추가
        row_count = len(table_data.get('No.', []))
        table_data[column_name] = [None] * row_count
        
        session['current_dataset']['table_data'] = table_data
        session.modified = True
        clean_table_data = clean_data_for_json(table_data)
        
        return jsonify({'status': 'success', 'table_data': clean_table_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/reset_data', methods=['POST'])
def reset_data():
    try:
        default_rows = 10
        session['current_dataset'] = {
            'sample_name': '',
            'production_date': datetime.now().strftime('%Y-%m-%d'),
            'pass_count': 1,
            'table_data': {
                'No.': list(range(1, default_rows + 1)),
                'Size(nm)': [None] * default_rows,
                'PI': [None] * default_rows
            },
            'pass_averages': []  # 패스별 평균값 저장
        }
        
        if 'last_results' in session:
            del session['last_results']
        
        clean_table_data = clean_data_for_json(session['current_dataset']['table_data'])
        
        return jsonify({'status': 'success', 'table_data': clean_table_data,
                       'sample_name': '', 'production_date': datetime.now().strftime('%Y-%m-%d'),
                       'pass_count': 1})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/calculate_with_thresholds', methods=['POST'])
def calculate_with_thresholds():
    try:
        data = request.get_json()
        thresholds = data.get('thresholds', {})
        
        current_dataset = session.get('current_dataset', {})
        sample_name = current_dataset.get('sample_name', 'Sample')
        production_date = current_dataset.get('production_date', '')
        pass_count = current_dataset.get('pass_count', 1)
        table_data = current_dataset.get('table_data', {})
        
        if not table_data:
            return jsonify({'status': 'error', 'message': '데이터가 없습니다.'})
        
        df = pd.DataFrame(table_data)
        
        # 유효한 데이터 추출
        valid_data = []
        for i in range(len(df)):
            size_val = df.iloc[i]['Size(nm)']
            pi_val = df.iloc[i]['PI']
            
            try:
                if size_val is not None and pi_val is not None:
                    size_float = float(size_val)
                    pi_float = float(pi_val)
                    if not (np.isnan(size_float) or np.isnan(pi_float) or
                            np.isinf(size_float) or np.isinf(pi_float)):
                        valid_data.append({
                            'No.': len(valid_data) + 1,
                            'Size(nm)': size_float,
                            'PI': pi_float
                        })
            except (ValueError, TypeError):
                continue
        
        if len(valid_data) == 0:
            return jsonify({'status': 'error', 'message': '유효한 데이터가 없습니다.'})
        
        valid_df = pd.DataFrame(valid_data)
        arr = valid_df['Size(nm)'].values
        
        # 각 방법별 이상치 검출 (사용자 지정 임계값 적용)
        methods = ['zscore', 'iqr', 'mad']
        method_names = {'zscore': 'Z-Score', 'iqr': 'IQR', 'mad': 'MAD'}
        
        def get_cleaned_stats(mask, name, threshold_used):
            cleaned = valid_df.loc[~mask].reset_index(drop=True)
            cleaned['No.'] = range(1, len(cleaned) + 1)
            outliers_removed = valid_df.loc[mask].reset_index(drop=True) if mask.any() else pd.DataFrame()
            
            return {
                'name': name,
                'threshold': threshold_used,
                'data': cleaned.to_dict('records'),
                'outliers': outliers_removed.to_dict('records'),
                'size_mean': float(cleaned['Size(nm)'].mean()) if len(cleaned) > 0 else 0,
                'size_std': float(cleaned['Size(nm)'].std()) if len(cleaned) > 0 else 0,
                'pi_mean': float(cleaned['PI'].mean()) if len(cleaned) > 0 else 0,
                'pi_std': float(cleaned['PI'].std()) if len(cleaned) > 0 else 0,
                'count': len(cleaned),
                'outliers_count': len(outliers_removed)
            }
        
        results = {
            'status': 'success',
            'sample_name': sample_name,
            'production_date': production_date,
            'pass_count': pass_count,
            'original_data': valid_df.to_dict('records'),
            'original_count': len(valid_df)
        }
        
        for method in methods:
            threshold = thresholds.get(method)
            mask = detect_outliers_with_threshold(arr, method, threshold)
            results[method] = get_cleaned_stats(mask, method_names[method], threshold)
        
        # 시각화 데이터 생성
        results['scatter_plot'] = create_scatter_plot(valid_data, f"{sample_name} - Original Data")
        
        session['last_results'] = results
        return jsonify(results)
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/save_dataset', methods=['POST'])
def save_dataset():
    try:
        data = request.get_json()
        dataset_name = data.get('dataset_name', '').strip()
        
        if not dataset_name:
            return jsonify({'status': 'error', 'message': '데이터셋 이름을 입력해주세요.'})
        
        current_dataset = session.get('current_dataset', {})
        if not current_dataset.get('table_data'):
            return jsonify({'status': 'error', 'message': '저장할 데이터가 없습니다.'})
        
        if 'datasets' not in session:
            session['datasets'] = {}
        
        # 현재 시간 추가
        save_data = current_dataset.copy()
        save_data['saved_at'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        session['datasets'][dataset_name] = save_data
        session.modified = True
        
        return jsonify({'status': 'success', 'message': f'데이터셋 "{dataset_name}"이 저장되었습니다.'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/load_dataset', methods=['POST'])
def load_dataset():
    try:
        data = request.get_json()
        dataset_name = data.get('dataset_name', '')
        
        if dataset_name not in session.get('datasets', {}):
            return jsonify({'status': 'error', 'message': '존재하지 않는 데이터셋입니다.'})
        
        # 불러온 데이터셋을 현재 세션에 설정
        loaded_dataset = session['datasets'][dataset_name].copy()
        session['current_dataset'] = loaded_dataset
        session.modified = True
        
        clean_table_data = clean_data_for_json(session['current_dataset']['table_data'])
        
        return jsonify({
            'status': 'success',
            'table_data': clean_table_data,
            'sample_name': loaded_dataset.get('sample_name', ''),
            'production_date': loaded_dataset.get('production_date', ''),
            'pass_count': loaded_dataset.get('pass_count', 1),
            'custom_data_field_name': loaded_dataset.get('custom_data_field_name', '사용자 입력 필드(레퍼런스)')
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/get_saved_datasets', methods=['GET'])
def get_saved_datasets():
    """저장된 데이터셋 목록을 반환"""
    try:
        datasets = session.get('datasets', {})
        dataset_list = []
        
        for name, data in datasets.items():
            dataset_info = {
                'name': name,
                'sample_name': data.get('sample_name', ''),
                'production_date': data.get('production_date', ''),
                'pass_count': data.get('pass_count', 1),
                'saved_at': data.get('saved_at', ''),
                'data_count': len(data.get('table_data', {}).get('No.', []))
            }
            dataset_list.append(dataset_info)
        
        return jsonify({
            'status': 'success',
            'datasets': dataset_list
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/delete_dataset', methods=['POST'])
def delete_dataset():
    """데이터셋 삭제"""
    try:
        data = request.get_json()
        dataset_name = data.get('dataset_name', '')
        
        if not dataset_name:
            return jsonify({'status': 'error', 'message': '삭제할 데이터셋 이름이 필요합니다.'})
        
        datasets = session.get('datasets', {})
        
        if dataset_name not in datasets:
            return jsonify({'status': 'error', 'message': '존재하지 않는 데이터셋입니다.'})
        
        del datasets[dataset_name]
        session['datasets'] = datasets
        session.modified = True  # Explicitly mark session as modified for persistence
        
        return jsonify({
            'status': 'success',
            'message': f'데이터셋 "{dataset_name}"이 삭제되었습니다.'
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/compare_datasets', methods=['POST'])
def compare_datasets():
    try:
        data = request.get_json()
        dataset_names = data.get('dataset_names', [])
        
        if len(dataset_names) < 2:
            return jsonify({'status': 'error', 'message': '비교하려면 최소 2개의 데이터셋을 선택해주세요.'})
        
        datasets = session.get('datasets', {})
        comparison_data = []
        
        for name in dataset_names:
            if name in datasets:
                dataset = datasets[name]
                table_data = dataset.get('table_data', {})
                df = pd.DataFrame(table_data)
                
                # 유효한 데이터만 추출
                valid_data = []
                for i in range(len(df)):
                    size_val = df.iloc[i].get('Size(nm)')
                    pi_val = df.iloc[i].get('PI')
                    
                    try:
                        if size_val is not None and pi_val is not None:
                            size_float = float(size_val)
                            pi_float = float(pi_val)
                            if not (np.isnan(size_float) or np.isnan(pi_float)):
                                valid_data.append({
                                    'Size(nm)': size_float,
                                    'PI': pi_float,
                                    'dataset': name
                                })
                    except (ValueError, TypeError):
                        continue
                
                comparison_data.extend(valid_data)
        
        if not comparison_data:
            return jsonify({'status': 'error', 'message': '비교할 유효한 데이터가 없습니다.'})
        
        # 비교 시각화 생성
        df_compare = pd.DataFrame(comparison_data)
        
        fig = px.scatter(df_compare, x='Size(nm)', y='PI', color='dataset',
                        title='Dataset Comparison',
                        labels={'Size(nm)': 'Size (nm)', 'PI': 'PI'})
        
        comparison_plot = json.dumps(fig, cls=PlotlyJSONEncoder)
        
        # 통계 요약
        stats_summary = {}
        for name in dataset_names:
            dataset_data = [d for d in comparison_data if d['dataset'] == name]
            if dataset_data:
                sizes = [d['Size(nm)'] for d in dataset_data]
                pis = [d['PI'] for d in dataset_data]
                
                stats_summary[name] = {
                    'count': len(dataset_data),
                    'size_mean': np.mean(sizes),
                    'size_std': np.std(sizes),
                    'pi_mean': np.mean(pis),
                    'pi_std': np.std(pis)
                }
        
        return jsonify({
            'status': 'success',
            'comparison_plot': comparison_plot,
            'stats_summary': stats_summary
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/upload_file', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'status': 'error', 'message': '파일이 선택되지 않았습니다.'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'status': 'error', 'message': '파일이 선택되지 않았습니다.'})
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            
            try:
                # 파일 읽기 및 메타데이터 추출
                metadata = {}
                if filename.endswith('.csv'):
                    # CSV 파일을 읽을 때 메타데이터 추출 및 데이터 부분 분리
                    try:
                        # 먼저 전체 파일을 읽어서 메타데이터와 데이터 시작점 찾기
                        file_content = file.read().decode('utf-8')
                        file.seek(0)  # 파일 포인터 리셋
                        
                        lines = file_content.split('\n')
                        data_start_line = 0
                        
                        # 메타데이터 추출 및 데이터 시작점 찾기
                        in_data_section = False
                        for i, line in enumerate(lines):
                            line = line.strip()
                            
                            # combined_data_outliers 파일의 특별한 구조 처리
                            if '=== 데이터 + 이상치 분석 결과 ===' in line:
                                in_data_section = True
                                continue
                            
                            # 메타데이터 추출 (데이터 섹션 이전에만)
                            if not in_data_section and ',' in line and not line.startswith('No.'):
                                parts = line.split(',', 1)
                                if len(parts) == 2:
                                    key = parts[0].strip()
                                    value = parts[1].strip()
                                    
                                    # 키-값 매핑
                                    if key in ['샘플명', 'sample_name', 'Sample Name']:
                                        metadata['sample_name'] = value
                                    elif key in ['생산일자', 'production_date', 'Production Date']:
                                        metadata['production_date'] = value
                                    elif key in ['패스', 'pass', 'Pass', '패스 수', 'pass_count']:
                                        try:
                                            metadata['pass_count'] = int(value)
                                        except ValueError:
                                            metadata['pass_count'] = 1
                            
                            # 데이터 시작점 찾기 (No. 컬럼이 있는 행)
                            if 'No.' in line and ('Size(nm)' in line or 'size(nm)' in line):
                                data_start_line = i
                                break
                        
                        if data_start_line > 0:
                            # 메타데이터 부분을 건너뛰고 데이터 부분만 읽기
                            df = pd.read_csv(file, skiprows=data_start_line)
                        else:
                            df = pd.read_csv(file)
                    except Exception:
                        # 일반적인 CSV 읽기로 fallback
                        file.seek(0)
                        df = pd.read_csv(file)
                else:
                    df = pd.read_excel(file)
                
                # 데이터 변환
                if len(df) == 0:
                    return jsonify({'status': 'error', 'message': '빈 파일입니다.'})
                
                # 컬럼 매핑 시도
                table_data = {'No.': list(range(1, len(df) + 1))}
                
                # 기본 컬럼들 찾기
                size_cols = [col for col in df.columns if 'size' in col.lower() or 'nm' in col.lower()]
                pi_cols = [col for col in df.columns if 'pi' in col.lower()]
                
                if size_cols:
                    table_data['Size(nm)'] = df[size_cols[0]].fillna('').tolist()
                else:
                    table_data['Size(nm)'] = [None] * len(df)
                
                if pi_cols:
                    table_data['PI'] = df[pi_cols[0]].fillna('').tolist()
                else:
                    table_data['PI'] = [None] * len(df)
                
                # 기타 컬럼들 추가 (숫자 및 이상치 컬럼 포함)
                for col in df.columns:
                    if col not in size_cols + pi_cols and col != 'No.':
                        # 숫자 컬럼 또는 이상치 관련 컬럼 추가
                        if pd.api.types.is_numeric_dtype(df[col]) or '_이상치' in col:
                            table_data[col] = df[col].fillna('').tolist()
                
                # 세션 데이터 업데이트 (메타데이터 포함)
                current_dataset = session.get('current_dataset', {})
                
                # 메타데이터가 있으면 기존 정보 업데이트
                if metadata:
                    if 'sample_name' in metadata:
                        current_dataset['sample_name'] = metadata['sample_name']
                    if 'production_date' in metadata:
                        current_dataset['production_date'] = metadata['production_date']
                    if 'pass_count' in metadata:
                        current_dataset['pass_count'] = metadata['pass_count']
                
                current_dataset['table_data'] = table_data
                session['current_dataset'] = current_dataset
                
                clean_table_data = clean_data_for_json(table_data)
                
                # 응답 메시지 생성
                message = f'파일이 성공적으로 업로드되었습니다. ({len(df)}행)'
                
                # combined_data_outliers 파일인지 확인
                outlier_cols = [col for col in df.columns if '_이상치' in col]
                if outlier_cols:
                    message += f' 이상치 분석 결과 파일이 감지되었습니다. ({len(outlier_cols)}개 이상치 컬럼 포함)'
                
                if metadata:
                    metadata_info = []
                    if 'sample_name' in metadata:
                        metadata_info.append(f"샘플명: {metadata['sample_name']}")
                    if 'production_date' in metadata:
                        metadata_info.append(f"생산일자: {metadata['production_date']}")
                    if 'pass_count' in metadata:
                        metadata_info.append(f"패스: {metadata['pass_count']}")
                    
                    if metadata_info:
                        message += f' 메타데이터도 자동 업데이트되었습니다. ({", ".join(metadata_info)})'
                
                return jsonify({
                    'status': 'success',
                    'table_data': clean_table_data,
                    'message': message,
                    'metadata': metadata,  # 추출된 메타데이터 정보
                    'sample_name': current_dataset.get('sample_name', ''),
                    'production_date': current_dataset.get('production_date', ''),
                    'pass_count': current_dataset.get('pass_count', 1),
                    'columns_mapped': {
                        'Size(nm)': size_cols[0] if size_cols else None,
                        'PI': pi_cols[0] if pi_cols else None,
                        'outlier_columns': outlier_cols
                    }
                })
                
            except Exception as e:
                return jsonify({'status': 'error', 'message': f'파일 읽기 오류: {str(e)}'})
        
        return jsonify({'status': 'error', 'message': '지원되지 않는 파일 형식입니다. (xlsx, xls, csv만 지원)'})
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_pass_average', methods=['POST'])
def add_pass_average():
    try:
        data = request.get_json()
        pass_number = data.get('pass_number')
        group_type = data.get('group_type', 'experimental')  # 'experimental' 또는 'control'
        size_avg = data.get('size_avg')
        pi_avg = data.get('pi_avg')
        removal_method = data.get('removal_method', '')
        threshold_used = data.get('threshold_used', '')
        custom_data_name = data.get('custom_data_name', '사용자 입력 필드(레퍼런스)')  # 사용자 정의 필드명
        custom_data_value = data.get('custom_data_value')  # 사용자 정의 데이터 값
        
        if not all([pass_number, size_avg is not None, pi_avg is not None]):
            return jsonify({'status': 'error', 'message': '필수 데이터가 누락되었습니다.'})
        
        current_dataset = session.get('current_dataset', {})
        if 'pass_averages' not in current_dataset:
            current_dataset['pass_averages'] = []
        
        # 사용자 정의 필드명 저장 (데이터셋 레벨에서 관리)
        if 'custom_data_field_name' not in current_dataset:
            current_dataset['custom_data_field_name'] = custom_data_name
        
        # 중복 패스 번호 및 그룹 체크
        existing_passes = [(p['pass_number'], p.get('group_type', 'experimental')) for p in current_dataset['pass_averages']]
        if (pass_number, group_type) in existing_passes:
            group_name = '실험군' if group_type == 'experimental' else '대조군'
            return jsonify({'status': 'error', 'message': f'패스 {pass_number} {group_name}이 이미 존재합니다.'})
        
        # 새 패스 데이터 추가
        new_pass = {
            'pass_number': int(pass_number),
            'group_type': group_type,
            'size_avg': float(size_avg),
            'pi_avg': float(pi_avg),
            'removal_method': removal_method,
            'threshold_used': threshold_used,
            'custom_data_value': float(custom_data_value) if custom_data_value is not None else None,
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        current_dataset['pass_averages'].append(new_pass)
        session['current_dataset'] = current_dataset
        
        return jsonify({
            'status': 'success',
            'message': f'패스 {pass_number} 평균값이 추가되었습니다.',
            'pass_averages': current_dataset['pass_averages'],
            'custom_data_field_name': current_dataset.get('custom_data_field_name', '점도')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_both_groups_pass_average', methods=['POST'])
def add_both_groups_pass_average():
    """실험군과 대조군 데이터를 동시에 추가"""
    try:
        data = request.get_json()
        pass_number = data.get('pass_number')
        custom_data_name = data.get('custom_data_name', '사용자 입력 필드(레퍼런스)')
        
        # 실험군 데이터
        exp_data = data.get('experimental', {})
        exp_size_avg = exp_data.get('size_avg')
        exp_pi_avg = exp_data.get('pi_avg')
        exp_custom_value = exp_data.get('custom_data_value')
        
        # 대조군 데이터
        ctrl_data = data.get('control', {})
        ctrl_size_avg = ctrl_data.get('size_avg')
        ctrl_pi_avg = ctrl_data.get('pi_avg')
        ctrl_custom_value = ctrl_data.get('custom_data_value')
        
        if not pass_number:
            return jsonify({'status': 'error', 'message': '패스 번호는 필수입니다.'})
        
        # 최소 하나의 그룹은 완전한 데이터를 가져야 함
        exp_complete = exp_size_avg is not None and exp_pi_avg is not None
        ctrl_complete = ctrl_size_avg is not None and ctrl_pi_avg is not None
        
        if not (exp_complete or ctrl_complete):
            return jsonify({'status': 'error', 'message': '최소 한 그룹의 Size와 PI 데이터는 필수입니다.'})
        
        current_dataset = session.get('current_dataset', {})
        if 'pass_averages' not in current_dataset:
            current_dataset['pass_averages'] = []
        
        # 사용자 정의 필드명 저장
        current_dataset['custom_data_field_name'] = custom_data_name
        
        # 기존 데이터 중복 체크
        existing_passes = [(p['pass_number'], p.get('group_type', 'experimental')) for p in current_dataset['pass_averages']]
        
        added_groups = []
        
        # 실험군 데이터 추가
        if exp_complete:
            if (int(pass_number), 'experimental') in existing_passes:
                return jsonify({'status': 'error', 'message': f'패스 {pass_number} 실험군이 이미 존재합니다.'})
            
            exp_pass = {
                'pass_number': int(pass_number),
                'group_type': 'experimental',
                'size_avg': float(exp_size_avg),
                'pi_avg': float(exp_pi_avg),
                'removal_method': 'Manual',
                'threshold_used': 'N/A',
                'custom_data_value': float(exp_custom_value) if exp_custom_value is not None and exp_custom_value != '' else None,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            current_dataset['pass_averages'].append(exp_pass)
            added_groups.append('실험군')
        
        # 대조군 데이터 추가
        if ctrl_complete:
            if (int(pass_number), 'control') in existing_passes:
                return jsonify({'status': 'error', 'message': f'패스 {pass_number} 대조군이 이미 존재합니다.'})
            
            ctrl_pass = {
                'pass_number': int(pass_number),
                'group_type': 'control',
                'size_avg': float(ctrl_size_avg),
                'pi_avg': float(ctrl_pi_avg),
                'removal_method': 'Manual',
                'threshold_used': 'N/A',
                'custom_data_value': float(ctrl_custom_value) if ctrl_custom_value is not None and ctrl_custom_value != '' else None,
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            }
            current_dataset['pass_averages'].append(ctrl_pass)
            added_groups.append('대조군')
        
        session['current_dataset'] = current_dataset
        
        groups_text = ', '.join(added_groups)
        return jsonify({
            'status': 'success',
            'message': f'패스 {pass_number} {groups_text} 데이터가 추가되었습니다.',
            'pass_averages': current_dataset['pass_averages'],
            'custom_data_field_name': current_dataset.get('custom_data_field_name', '점도')
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/delete_pass_average', methods=['POST'])
def delete_pass_average():
    try:
        data = request.get_json()
        pass_number = data.get('pass_number')
        group_type = data.get('group_type', 'experimental')  # 그룹 타입 추가
        
        if pass_number is None:
            return jsonify({'status': 'error', 'message': '패스 번호가 필요합니다.'})
        
        current_dataset = session.get('current_dataset', {})
        if 'pass_averages' not in current_dataset:
            return jsonify({'status': 'error', 'message': '삭제할 패스 데이터가 없습니다.'})
        
        # 해당 패스 번호 및 그룹 타입 삭제
        original_length = len(current_dataset['pass_averages'])
        current_dataset['pass_averages'] = [
            p for p in current_dataset['pass_averages'] 
            if not (p['pass_number'] == int(pass_number) and p.get('group_type', 'experimental') == group_type)
        ]
        
        if len(current_dataset['pass_averages']) == original_length:
            group_name = '실험군' if group_type == 'experimental' else '대조군'
            return jsonify({'status': 'error', 'message': f'패스 {pass_number} {group_name}을 찾을 수 없습니다.'})
        
        session['current_dataset'] = current_dataset
        
        group_name = '실험군' if group_type == 'experimental' else '대조군'
        return jsonify({
            'status': 'success',
            'message': f'패스 {pass_number} {group_name}이 삭제되었습니다.',
            'pass_averages': current_dataset['pass_averages']
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/get_pass_trend_data', methods=['GET'])
def get_pass_trend_data():
    try:
        current_dataset = session.get('current_dataset', {})
        pass_averages = current_dataset.get('pass_averages', [])
        
        if not pass_averages:
            return jsonify({'status': 'error', 'message': '패스 데이터가 없습니다.'})
        
        # 패스 번호 순으로 정렬
        sorted_passes = sorted(pass_averages, key=lambda x: x['pass_number'])
        
        # 트렌드 차트용 데이터 준비
        pass_numbers = [p['pass_number'] for p in sorted_passes]
        size_avgs = [p['size_avg'] for p in sorted_passes]
        pi_avgs = [p['pi_avg'] for p in sorted_passes]
        
        # Plotly 차트 데이터 생성
        fig_size = go.Figure()
        fig_size.add_trace(go.Scatter(
            x=pass_numbers,
            y=size_avgs,
            mode='lines+markers',
            name='Size(nm) 평균',
            line=dict(color='blue', width=3),
            marker=dict(size=8)
        ))
        fig_size.update_layout(
            title='패스별 Size(nm) 평균값 트렌드',
            xaxis_title='패스 번호',
            yaxis_title='Size(nm) 평균',
            height=400
        )
        
        fig_pi = go.Figure()
        fig_pi.add_trace(go.Scatter(
            x=pass_numbers,
            y=pi_avgs,
            mode='lines+markers',
            name='PI 평균',
            line=dict(color='red', width=3),
            marker=dict(size=8)
        ))
        fig_pi.update_layout(
            title='패스별 PI 평균값 트렌드',
            xaxis_title='패스 번호',
            yaxis_title='PI 평균',
            height=400
        )
        
        # 상관관계 차트
        fig_correlation = go.Figure()
        fig_correlation.add_trace(go.Scatter(
            x=size_avgs,
            y=pi_avgs,
            mode='markers+text',
            text=[f'P{p}' for p in pass_numbers],
            textposition='top center',
            marker=dict(size=10, color=pass_numbers, colorscale='viridis'),
            name='Size vs PI'
        ))
        fig_correlation.update_layout(
            title='Size(nm) vs PI 상관관계 (패스별)',
            xaxis_title='Size(nm) 평균',
            yaxis_title='PI 평균',
            height=400
        )
        
        # 고급 통계 계산
        stats = {
            'pass_count': len(sorted_passes),
            'size_trend': 'stable',
            'pi_trend': 'stable',
            'size_cv': (np.std(size_avgs) / np.mean(size_avgs) * 100) if size_avgs else 0,
            'pi_cv': (np.std(pi_avgs) / np.mean(pi_avgs) * 100) if pi_avgs else 0,
            'size_mean': np.mean(size_avgs) if size_avgs else 0,
            'size_std': np.std(size_avgs) if size_avgs else 0,
            'size_min': np.min(size_avgs) if size_avgs else 0,
            'size_max': np.max(size_avgs) if size_avgs else 0,
            'pi_mean': np.mean(pi_avgs) if pi_avgs else 0,
            'pi_std': np.std(pi_avgs) if pi_avgs else 0,
            'pi_min': np.min(pi_avgs) if pi_avgs else 0,
            'pi_max': np.max(pi_avgs) if pi_avgs else 0
        }
        
        # 상관계수 계산
        if len(size_avgs) >= 3 and len(pi_avgs) >= 3:
            correlation = np.corrcoef(size_avgs, pi_avgs)[0, 1]
            stats['correlation'] = correlation if not np.isnan(correlation) else 0
        else:
            stats['correlation'] = 0
        
        # 트렌드 계산 (리니어 회귀 기반)
        if len(size_avgs) >= 3:
            # 리니어 회귀로 기울기 계산
            x = np.array(pass_numbers)
            y_size = np.array(size_avgs)
            slope_size = np.polyfit(x, y_size, 1)[0]
            
            if abs(slope_size) > 0.01:  # 임계값 조정
                if slope_size > 0:
                    stats['size_trend'] = 'increasing'
                else:
                    stats['size_trend'] = 'decreasing'
            stats['size_slope'] = float(slope_size)
        else:
            stats['size_slope'] = 0
                
        if len(pi_avgs) >= 3:
            x = np.array(pass_numbers)
            y_pi = np.array(pi_avgs)
            slope_pi = np.polyfit(x, y_pi, 1)[0]
            
            if abs(slope_pi) > 0.001:  # PI는 더 작은 임계값
                if slope_pi > 0:
                    stats['pi_trend'] = 'increasing'
                else:
                    stats['pi_trend'] = 'decreasing'
            stats['pi_slope'] = float(slope_pi)
        else:
            stats['pi_slope'] = 0
        
        # 공정 능력 지수 (Cpk 근사치)
        if len(size_avgs) >= 6:  # 충분한 데이터가 있을 때
            size_mean = np.mean(size_avgs)
            size_std = np.std(size_avgs)
            if size_std > 0:
                # 가정: 사양 3시그마 공정 능력
                stats['size_capability'] = (3 * size_std) / size_mean * 100
            else:
                stats['size_capability'] = 0
        else:
            stats['size_capability'] = 0
        
        return jsonify({
            'status': 'success',
            'size_trend_chart': json.dumps(fig_size, cls=PlotlyJSONEncoder),
            'pi_trend_chart': json.dumps(fig_pi, cls=PlotlyJSONEncoder),
            'correlation_chart': json.dumps(fig_correlation, cls=PlotlyJSONEncoder),
            'statistics': stats,
            'pass_data': sorted_passes
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/get_custom_data_correlation', methods=['GET'])
def get_custom_data_correlation():
    """사용자 정의 데이터와 Size(nm) 간의 상관관계 분석 (실험군/대조군 구분)"""
    try:
        current_dataset = session.get('current_dataset', {})
        pass_averages = current_dataset.get('pass_averages', [])
        sample_name = current_dataset.get('sample_name', 'Sample')
        production_date = current_dataset.get('production_date', '')
        custom_field_name = current_dataset.get('custom_data_field_name', '사용자 입력 필드(레퍼런스)')
        
        # 실험군과 대조군 데이터 분리
        experimental_data = []
        control_data = []
        
        for pass_data in pass_averages:
            if pass_data.get('custom_data_value') is not None:
                data_point = {
                    'pass_number': pass_data['pass_number'],
                    'size_avg': pass_data['size_avg'],
                    'custom_value': pass_data['custom_data_value']
                }
                
                if pass_data.get('group_type', 'experimental') == 'experimental':
                    experimental_data.append(data_point)
                else:
                    control_data.append(data_point)
        
        if len(experimental_data) == 0 and len(control_data) == 0:
            return jsonify({'status': 'error', 'message': f'{custom_field_name} 상관관계 분석을 위해서는 최소 1개의 데이터가 필요합니다.'})
        
        # 상관관계 차트 생성
        fig = go.Figure()
        
        # 점도 데이터인 경우 기준값 추가
        if custom_field_name in ['점도', 'viscosity']:
            reference_data = [
                {'name': 'UHV', 'value': 11780, 'size_avg': 220.2},
                {'name': 'HV', 'value': 8615, 'size_avg': 185.2},
                {'name': 'LV', 'value': 4948, 'size_avg': 157.8}
            ]
            
            # 기준값 플롯 (빨간색)
            for ref in reference_data:
                fig.add_trace(go.Scatter(
                    x=[ref['value']],
                    y=[ref['size_avg']],
                    mode='markers+text',
                    text=[ref['name']],
                    textposition='top center',
                    marker=dict(size=15, color='red', symbol='circle', 
                               line=dict(width=2, color='black')),
                    name=f"Reference - {ref['name']}" if ref == reference_data[0] else '',
                    showlegend=ref == reference_data[0],
                    legendgroup='reference'
                ))
        
        # 실험군 데이터 플롯 (파란색)
        if experimental_data:
            exp_custom_values = [d['custom_value'] for d in experimental_data]
            exp_sizes = [d['size_avg'] for d in experimental_data]
            exp_pass_numbers = [d['pass_number'] for d in experimental_data]
            
            fig.add_trace(go.Scatter(
                x=exp_custom_values,
                y=exp_sizes,
                mode='markers+text',
                text=[str(p) for p in exp_pass_numbers],
                textposition='top center',
                marker=dict(size=10, color='blue', symbol='circle',
                           line=dict(width=2, color='black')),
                name='실험군',
                showlegend=True
            ))
        
        # 대조군 데이터 플롯 (초록색)
        if control_data:
            ctrl_custom_values = [d['custom_value'] for d in control_data]
            ctrl_sizes = [d['size_avg'] for d in control_data]
            ctrl_pass_numbers = [d['pass_number'] for d in control_data]
            
            fig.add_trace(go.Scatter(
                x=ctrl_custom_values,
                y=ctrl_sizes,
                mode='markers+text',
                text=[str(p) for p in ctrl_pass_numbers],
                textposition='top center',
                marker=dict(size=10, color='green', symbol='circle',
                           line=dict(width=2, color='black')),
                name='대조군',
                showlegend=True
            ))
        
        # 레이아웃 설정
        x_axis_title = f'{custom_field_name}'
        if custom_field_name in ['점도', 'viscosity']:
            x_axis_title += ' (10 s⁻¹, cP)'
        
        fig.update_layout(
            title=f'Production Data - {custom_field_name} vs Size<br>{sample_name}',
            xaxis_title=x_axis_title,
            yaxis_title='Size (nm)',
            height=600,
            width=800,
            font=dict(size=12),
            showlegend=True,
            legend=dict(
                x=1.02,
                y=1,
                xanchor='left',
                yanchor='top'
            )
        )
        
        # 통계 정보
        all_data = experimental_data + control_data
        all_custom_values = [d['custom_value'] for d in all_data]
        all_sizes = [d['size_avg'] for d in all_data]
        
        # 상관계수 계산
        if len(all_custom_values) >= 2:
            correlation = np.corrcoef(all_custom_values, all_sizes)[0, 1]
            correlation = correlation if not np.isnan(correlation) else 0
        else:
            correlation = 0
        
        stats = {
            'correlation': float(correlation),
            'experimental_count': len(experimental_data),
            'control_count': len(control_data),
            'total_count': len(all_data),
            'sample_name': sample_name,
            'production_date': production_date,
            'custom_field_name': custom_field_name
        }
        
        return jsonify({
            'status': 'success',
            'custom_correlation_chart': json.dumps(fig, cls=PlotlyJSONEncoder),
            'statistics': stats,
            'experimental_data': experimental_data,
            'control_data': control_data,
            'custom_field_name': custom_field_name
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_viscosity_data', methods=['POST'])
def add_viscosity_data():
    """점도 데이터 추가 (향후 확장용)"""
    try:
        data = request.get_json()
        pass_number = data.get('pass_number')
        viscosity = data.get('viscosity')
        temperature = data.get('temperature', 25)  # 기본값 25도
        shear_rate = data.get('shear_rate', 100)   # 기본값 100 s^-1
        
        if not all([pass_number, viscosity]):
            return jsonify({'status': 'error', 'message': '패스 번호와 점도 값이 필요합니다.'})
        
        current_dataset = session.get('current_dataset', {})
        pass_averages = current_dataset.get('pass_averages', [])
        
        # 해당 패스 찾기
        for pass_data in pass_averages:
            if pass_data['pass_number'] == int(pass_number):
                pass_data['viscosity_data'] = {
                    'viscosity': float(viscosity),
                    'temperature': float(temperature),
                    'shear_rate': float(shear_rate),
                    'measurement_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }
                break
        else:
            return jsonify({'status': 'error', 'message': f'패스 {pass_number}을 찾을 수 없습니다.'})
        
        session['current_dataset'] = current_dataset
        
        return jsonify({
            'status': 'success',
            'message': f'패스 {pass_number}에 점도 데이터가 추가되었습니다.',
            'pass_averages': pass_averages
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/get_viscosity_correlation', methods=['GET'])
def get_viscosity_correlation():
    """점도와 입자 특성 간 상관관계 분석 (향후 확장용)"""
    try:
        current_dataset = session.get('current_dataset', {})
        pass_averages = current_dataset.get('pass_averages', [])
        
        # 점도 데이터가 있는 패스만 필터링
        viscosity_data = []
        for pass_data in pass_averages:
            if 'viscosity_data' in pass_data:
                viscosity_data.append({
                    'pass_number': pass_data['pass_number'],
                    'size_avg': pass_data['size_avg'],
                    'pi_avg': pass_data['pi_avg'],
                    'viscosity': pass_data['viscosity_data']['viscosity'],
                    'temperature': pass_data['viscosity_data']['temperature']
                })
        
        if len(viscosity_data) < 3:
            return jsonify({'status': 'error', 'message': '상관관계 분석을 위해서는 최소 3개의 점도 데이터가 필요합니다.'})
        
        # 상관관계 차트 생성
        sizes = [d['size_avg'] for d in viscosity_data]
        pis = [d['pi_avg'] for d in viscosity_data]
        viscosities = [d['viscosity'] for d in viscosity_data]
        
        # Size vs Viscosity
        fig_size_visc = go.Figure()
        fig_size_visc.add_trace(go.Scatter(
            x=sizes,
            y=viscosities,
            mode='markers+text',
            text=[f'P{d["pass_number"]}' for d in viscosity_data],
            textposition='top center',
            marker=dict(size=10, color='blue'),
            name='Size vs Viscosity'
        ))
        fig_size_visc.update_layout(
            title='Size(nm) vs Viscosity 상관관계',
            xaxis_title='Size(nm) 평균',
            yaxis_title='Viscosity (cP)',
            height=400
        )
        
        # PI vs Viscosity
        fig_pi_visc = go.Figure()
        fig_pi_visc.add_trace(go.Scatter(
            x=pis,
            y=viscosities,
            mode='markers+text',
            text=[f'P{d["pass_number"]}' for d in viscosity_data],
            textposition='top center',
            marker=dict(size=10, color='red'),
            name='PI vs Viscosity'
        ))
        fig_pi_visc.update_layout(
            title='PI vs Viscosity 상관관계',
            xaxis_title='PI 평균',
            yaxis_title='Viscosity (cP)',
            height=400
        )
        
        # 상관계수 계산
        size_visc_corr = np.corrcoef(sizes, viscosities)[0, 1] if len(sizes) > 1 else 0
        pi_visc_corr = np.corrcoef(pis, viscosities)[0, 1] if len(pis) > 1 else 0
        
        return jsonify({
            'status': 'success',
            'size_viscosity_chart': json.dumps(fig_size_visc, cls=PlotlyJSONEncoder),
            'pi_viscosity_chart': json.dumps(fig_pi_visc, cls=PlotlyJSONEncoder),
            'correlations': {
                'size_viscosity': float(size_visc_corr) if not np.isnan(size_visc_corr) else 0,
                'pi_viscosity': float(pi_visc_corr) if not np.isnan(pi_visc_corr) else 0
            },
            'data_count': len(viscosity_data)
        })
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/download_table_data')
def download_table_data():
    """현재 데이터 테이블을 CSV로 다운로드"""
    data_only = request.args.get('data_only', 'false').lower() == 'true'
    try:
        current_dataset = session.get('current_dataset', {})
        table_data = current_dataset.get('table_data', {})
        
        if not table_data:
            return jsonify({'status': 'error', 'message': '다운로드할 데이터가 없습니다.'})
        
        df = pd.DataFrame(table_data)
        
        # 유효한 데이터만 추출 (빈 행 제거)
        valid_rows = []
        for i in range(len(df)):
            row_data = {}
            has_data = False
            
            for col in df.columns:
                if col == 'No.':
                    row_data[col] = df.iloc[i][col]
                else:
                    value = df.iloc[i][col]
                    if value is not None and value != '' and str(value).strip() != '':
                        row_data[col] = value
                        has_data = True
                    else:
                        row_data[col] = ''
            
            if has_data:  # 데이터가 있는 행만 포함
                valid_rows.append(row_data)
        
        if not valid_rows:
            return jsonify({'status': 'error', 'message': '유효한 데이터가 없습니다.'})
        
        # DataFrame 생성
        df_valid = pd.DataFrame(valid_rows)
        
        # 컬럼 순서 정렬 (No., Size(nm), PI, 기타)
        ordered_columns = ['No.', 'Size(nm)', 'PI']
        all_columns = list(df_valid.columns)
        other_columns = [col for col in all_columns if col not in ordered_columns]
        column_order = [col for col in ordered_columns if col in all_columns] + other_columns
        
        df_valid = df_valid[column_order]
        
        # CSV 생성
        sample_name = current_dataset.get('sample_name', 'Sample')
        production_date = current_dataset.get('production_date', '')
        pass_count = current_dataset.get('pass_count', 1)
        
        if data_only:
            # 데이터만 다운로드 (메타데이터 없음)
            final_csv = df_valid.to_csv(index=False, encoding='utf-8')
        else:
            # 메타데이터 포함 다운로드
            csv_content = []
            
            # 메타데이터 추가 (컬럼 수 맞추기)
            csv_content.append(f"샘플명,{sample_name if sample_name else 'Unknown'}")
            csv_content.append(f"생산일자,{production_date if production_date else 'Unknown'}")
            csv_content.append(f"패스,{pass_count}")
            csv_content.append(f"다운로드일시,{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            csv_content.append(f"총 데이터 수,{len(df_valid)}")
            csv_content.append("")
            
            # 데이터 추가
            csv_data = df_valid.to_csv(index=False, encoding='utf-8')
            csv_content.append(csv_data.strip())
            
            final_csv = '\n'.join(csv_content)
        final_csv_bytes = '\ufeff' + final_csv  # BOM 추가
        
        response = make_response(final_csv_bytes.encode('utf-8'))
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        
        import urllib.parse
        filename = f"table_data_{sample_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        encoded_filename = urllib.parse.quote(filename.encode('utf-8'))
        
        response.headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/download_csv')
def download_csv():
    try:
        results = session.get('last_results')
        if not results:
            return jsonify({'status': 'error', 'message': '저장할 결과가 없습니다. 먼저 계산을 실행하세요.'})
        
        csv_content = []
        sample_name = results.get('sample_name', '샘플')
        production_date = results.get('production_date', '')
        pass_count = results.get('pass_count', 1)
        
        csv_content.append(f"샘플명,{sample_name}")
        csv_content.append(f"생산일자,{production_date}")
        csv_content.append(f"패스,{pass_count}")
        csv_content.append(f"계산일시,{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        csv_content.append("")
        
        csv_content.append("=== 원본 데이터 ===")
        original_df = pd.DataFrame(results['original_data'])
        csv_content.append(f"총 {results['original_count']}개 데이터")
        csv_content.append("")
        
        # 컬럼 순서 지정: No., Size(nm), PI, then others
        ordered_columns = ['No.', 'Size(nm)', 'PI']
        all_columns = list(original_df.columns)
        other_columns = [col for col in all_columns if col not in ordered_columns]
        column_order = [col for col in ordered_columns if col in all_columns] + other_columns
        original_df = original_df[column_order]
        
        original_csv = original_df.to_csv(index=False, encoding='utf-8')
        csv_content.append(original_csv.strip())
        csv_content.append("")
        csv_content.append("")
        
        methods = ['zscore', 'iqr', 'mad']
        method_names = {'zscore': 'Z-Score 이상치 제거', 'iqr': 'IQR 이상치 제거', 'mad': 'MAD 이상치 제거'}
        
        for method in methods:
            method_result = results[method]
            csv_content.append(f"=== {method_names[method]} 결과 (임계값: {method_result['threshold']}) ===")
            csv_content.append(f"처리된 데이터 개수,{method_result['count']}개")
            csv_content.append(f"제거된 이상치 개수,{method_result['outliers_count']}개")
            csv_content.append(f"Size(nm) 평균,{method_result['size_mean']:.3f}")
            csv_content.append(f"Size(nm) 표준편차,{method_result['size_std']:.3f}")
            csv_content.append(f"PI 평균,{method_result['pi_mean']:.3f}")
            csv_content.append(f"PI 표준편차,{method_result['pi_std']:.3f}")
            csv_content.append("")
            
            cleaned_df = pd.DataFrame(method_result['data'])
            if len(cleaned_df) > 0:
                # 컬럼 순서 지정: No., Size(nm), PI, then others
                cleaned_all_columns = list(cleaned_df.columns)
                cleaned_other_columns = [col for col in cleaned_all_columns if col not in ordered_columns]
                cleaned_column_order = [col for col in ordered_columns if col in cleaned_all_columns] + cleaned_other_columns
                cleaned_df = cleaned_df[cleaned_column_order]
                
                cleaned_csv = cleaned_df.to_csv(index=False, encoding='utf-8')
                csv_content.append(cleaned_csv.strip())
            csv_content.append("")
            csv_content.append("")
        
        final_csv = '\n'.join(csv_content)
        final_csv_bytes = '\ufeff' + final_csv
        
        response = make_response(final_csv_bytes.encode('utf-8'))
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        
        import urllib.parse
        filename = f"outlier_results_{sample_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        encoded_filename = urllib.parse.quote(filename.encode('utf-8'))
        
        response.headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/download_combined_results')
def download_combined_results():
    """원본 데이터와 이상치 계산 결과를 결합하여 다운로드"""
    try:
        # 현재 데이터 테이블 가져오기
        current_dataset = session.get('current_dataset', {})
        table_data = current_dataset.get('table_data', {})
        
        # 이상치 계산 결과 가져오기
        results = session.get('last_results')
        
        if not table_data:
            return jsonify({'status': 'error', 'message': '데이터 테이블이 없습니다.'})
        
        if not results:
            return jsonify({'status': 'error', 'message': '이상치 계산 결과가 없습니다. 먼저 계산을 실행하세요.'})
        
        # 메타데이터 추출
        sample_name = current_dataset.get('sample_name', '샘플')
        production_date = current_dataset.get('production_date', '')
        pass_count = current_dataset.get('pass_count', 1)
        
        # 원본 데이터 테이블 처리
        original_df = pd.DataFrame(table_data)
        
        # 유효한 데이터만 추출 (빈 행 제거)
        valid_rows = []
        for i in range(len(original_df)):
            row_data = {}
            has_data = False
            
            for col in original_df.columns:
                if col == 'No.':
                    row_data[col] = original_df.iloc[i][col]
                else:
                    value = original_df.iloc[i][col]
                    if value is not None and value != '' and str(value).strip() != '':
                        row_data[col] = value
                        has_data = True
                    else:
                        row_data[col] = ''
            
            if has_data:
                valid_rows.append(row_data)
        
        if not valid_rows:
            return jsonify({'status': 'error', 'message': '유효한 데이터가 없습니다.'})
        
        # 결합된 데이터 생성
        combined_data = []
        
        # 원본 데이터에 이상치 분석 결과 추가
        original_data_dict = {row['No.']: row for row in valid_rows}
        
        # 이상치 계산 결과에서 각 데이터 포인트의 이상치 여부 확인
        methods = ['zscore', 'iqr', 'mad']
        method_names = {'zscore': 'Z-Score', 'iqr': 'IQR', 'mad': 'MAD'}
        
        # 계산 결과에서 원본 데이터 순서 유지
        calc_original_data = results.get('original_data', [])
        
        for calc_row in calc_original_data:
            # 원본 테이블에서 해당 행 찾기
            original_row = None
            for orig_row in valid_rows:
                if (abs(float(orig_row.get('Size(nm)', 0) or 0) - calc_row.get('Size(nm)', 0)) < 0.001 and
                    abs(float(orig_row.get('PI', 0) or 0) - calc_row.get('PI', 0)) < 0.001):
                    original_row = orig_row.copy()
                    break
            
            if original_row is None:
                continue
            
            # 각 방법별 이상치 여부 추가
            for method in methods:
                method_result = results.get(method, {})
                outliers = method_result.get('outliers', [])
                
                is_outlier = False
                for outlier in outliers:
                    if (abs(outlier.get('Size(nm)', 0) - calc_row.get('Size(nm)', 0)) < 0.001 and
                        abs(outlier.get('PI', 0) - calc_row.get('PI', 0)) < 0.001):
                        is_outlier = True
                        break
                
                original_row[f'{method_names[method]}_이상치'] = '예' if is_outlier else '아니오'
            
            combined_data.append(original_row)
        
        # DataFrame 생성
        combined_df = pd.DataFrame(combined_data)
        
        # 컬럼 순서 정렬
        base_columns = ['No.', 'Size(nm)', 'PI']
        outlier_columns = [f'{method_names[method]}_이상치' for method in methods]
        other_columns = [col for col in combined_df.columns if col not in base_columns + outlier_columns]
        
        column_order = [col for col in base_columns if col in combined_df.columns] + other_columns + outlier_columns
        combined_df = combined_df[column_order]
        
        # CSV 생성
        csv_content = []
        
        # 메타데이터 추가
        csv_content.append(f"샘플명,{sample_name}")
        csv_content.append(f"생산일자,{production_date}")
        csv_content.append(f"패스,{pass_count}")
        csv_content.append(f"분석일시,{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        csv_content.append(f"총 데이터 수,{len(combined_df)}")
        csv_content.append("")
        
        # 이상치 분석 요약
        csv_content.append("=== 이상치 분석 요약 ===")
        for method in methods:
            method_result = results.get(method, {})
            csv_content.append(f"{method_names[method]} 방법 (임계값: {method_result.get('threshold', 'N/A')})")
            csv_content.append(f"  - 이상치 개수: {method_result.get('outliers_count', 0)}개")
            csv_content.append(f"  - 정상 데이터 개수: {method_result.get('count', 0)}개")
            csv_content.append(f"  - 처리 후 Size(nm) 평균: {method_result.get('size_mean', 0):.3f}")
            csv_content.append(f"  - 처리 후 PI 평균: {method_result.get('pi_mean', 0):.3f}")
        csv_content.append("")
        
        # 설명 추가
        csv_content.append("=== 컬럼 설명 ===")
        csv_content.append("No.: 데이터 순번")
        csv_content.append("Size(nm): 입자 크기 (나노미터)")
        csv_content.append("PI: 다분산 지수")
        for method in methods:
            csv_content.append(f"{method_names[method]}_이상치: {method_names[method]} 방법으로 판단한 이상치 여부 (예/아니오)")
        csv_content.append("")
        
        # 결합된 데이터 추가
        csv_content.append("=== 데이터 + 이상치 분석 결과 ===")
        combined_csv = combined_df.to_csv(index=False, encoding='utf-8')
        csv_content.append(combined_csv.strip())
        
        # 최종 CSV 생성
        final_csv = '\n'.join(csv_content)
        final_csv_bytes = '\ufeff' + final_csv  # BOM 추가
        
        response = make_response(final_csv_bytes.encode('utf-8'))
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'
        
        import urllib.parse
        filename = f"combined_data_outliers_{sample_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        encoded_filename = urllib.parse.quote(filename.encode('utf-8'))
        
        response.headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"
        
        return response
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)