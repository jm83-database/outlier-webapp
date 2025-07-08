import os
from flask import Flask, render_template, request, session, jsonify, make_response
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
        x=df['size(nm)'],
        y=df['PI'],
        mode='markers',
        marker=dict(
            size=8,
            color='rgba(55, 128, 191, 0.7)',
            line=dict(width=1, color='rgba(55, 128, 191, 1)')
        ),
        name='Data Points',
        text=[f"Point {i+1}<br>Size: {row['size(nm)']:.3f}<br>PI: {row['PI']:.3f}" 
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

@app.route('/')
def index():
    if 'datasets' not in session:
        session['datasets'] = {}
    
    if 'current_dataset' not in session:
        default_rows = 10
        session['current_dataset'] = {
            'sample_name': '',
            'production_date': datetime.now().strftime('%Y-%m-%d'),
            'pass_count': 1,
            'table_data': {
                'No.': list(range(1, default_rows + 1)),
                'size(nm)': [None] * default_rows,
                'PI': [None] * default_rows
            }
        }
    
    clean_table_data = clean_data_for_json(session['current_dataset']['table_data'])
    return render_template('index.html',
                         table_data=clean_table_data,
                         sample_name=session['current_dataset'].get('sample_name', ''),
                         production_date=session['current_dataset'].get('production_date', ''),
                         pass_count=session['current_dataset'].get('pass_count', 1),
                         saved_datasets=list(session['datasets'].keys()))

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
        for key in ['size(nm)', 'PI']:
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
        
        session['current_dataset'] = {
            'sample_name': sample_name,
            'production_date': production_date,
            'pass_count': pass_count,
            'table_data': table_data
        }
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_row', methods=['POST'])
def add_row():
    try:
        table_data = session.get('current_dataset', {}).get('table_data', {'No.': [], 'size(nm)': [], 'PI': []})
        new_no = len(table_data['No.']) + 1
        
        table_data['No.'].append(new_no)
        table_data['size(nm)'].append(None)
        table_data['PI'].append(None)
        
        session['current_dataset']['table_data'] = table_data
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
                'size(nm)': [None] * default_rows,
                'PI': [None] * default_rows
            }
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
            size_val = df.iloc[i]['size(nm)']
            pi_val = df.iloc[i]['PI']
            
            try:
                if size_val is not None and pi_val is not None:
                    size_float = float(size_val)
                    pi_float = float(pi_val)
                    if not (np.isnan(size_float) or np.isnan(pi_float) or
                            np.isinf(size_float) or np.isinf(pi_float)):
                        valid_data.append({
                            'No.': len(valid_data) + 1,
                            'size(nm)': size_float,
                            'PI': pi_float
                        })
            except (ValueError, TypeError):
                continue
        
        if len(valid_data) == 0:
            return jsonify({'status': 'error', 'message': '유효한 데이터가 없습니다.'})
        
        valid_df = pd.DataFrame(valid_data)
        arr = valid_df['size(nm)'].values
        
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
                'size_mean': float(cleaned['size(nm)'].mean()) if len(cleaned) > 0 else 0,
                'size_std': float(cleaned['size(nm)'].std()) if len(cleaned) > 0 else 0,
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
        
        session['current_dataset'] = session['datasets'][dataset_name].copy()
        
        clean_table_data = clean_data_for_json(session['current_dataset']['table_data'])
        
        return jsonify({
            'status': 'success',
            'table_data': clean_table_data,
            'sample_name': session['current_dataset'].get('sample_name', ''),
            'production_date': session['current_dataset'].get('production_date', ''),
            'pass_count': session['current_dataset'].get('pass_count', 1)
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
                    size_val = df.iloc[i].get('size(nm)')
                    pi_val = df.iloc[i].get('PI')
                    
                    try:
                        if size_val is not None and pi_val is not None:
                            size_float = float(size_val)
                            pi_float = float(pi_val)
                            if not (np.isnan(size_float) or np.isnan(pi_float)):
                                valid_data.append({
                                    'size(nm)': size_float,
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
        
        fig = px.scatter(df_compare, x='size(nm)', y='PI', color='dataset',
                        title='Dataset Comparison',
                        labels={'size(nm)': 'Size (nm)', 'PI': 'PI'})
        
        comparison_plot = json.dumps(fig, cls=PlotlyJSONEncoder)
        
        # 통계 요약
        stats_summary = {}
        for name in dataset_names:
            dataset_data = [d for d in comparison_data if d['dataset'] == name]
            if dataset_data:
                sizes = [d['size(nm)'] for d in dataset_data]
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
                # 파일 읽기
                if filename.endswith('.csv'):
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
                    table_data['size(nm)'] = df[size_cols[0]].fillna('').tolist()
                else:
                    table_data['size(nm)'] = [None] * len(df)
                
                if pi_cols:
                    table_data['PI'] = df[pi_cols[0]].fillna('').tolist()
                else:
                    table_data['PI'] = [None] * len(df)
                
                # 기타 숫자 컬럼들 추가
                for col in df.columns:
                    if col not in size_cols + pi_cols and pd.api.types.is_numeric_dtype(df[col]):
                        table_data[col] = df[col].fillna('').tolist()
                
                session['current_dataset']['table_data'] = table_data
                clean_table_data = clean_data_for_json(table_data)
                
                return jsonify({
                    'status': 'success',
                    'table_data': clean_table_data,
                    'message': f'파일이 성공적으로 업로드되었습니다. ({len(df)}행)',
                    'columns_mapped': {
                        'size(nm)': size_cols[0] if size_cols else None,
                        'PI': pi_cols[0] if pi_cols else None
                    }
                })
                
            except Exception as e:
                return jsonify({'status': 'error', 'message': f'파일 읽기 오류: {str(e)}'})
        
        return jsonify({'status': 'error', 'message': '지원되지 않는 파일 형식입니다. (xlsx, xls, csv만 지원)'})
        
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
            csv_content.append(f"size(nm) 평균,{method_result['size_mean']:.3f}")
            csv_content.append(f"size(nm) 표준편차,{method_result['size_std']:.3f}")
            csv_content.append(f"PI 평균,{method_result['pi_mean']:.3f}")
            csv_content.append(f"PI 표준편차,{method_result['pi_std']:.3f}")
            csv_content.append("")
            
            cleaned_df = pd.DataFrame(method_result['data'])
            if len(cleaned_df) > 0:
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)