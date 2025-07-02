import os
from flask import Flask, render_template, request, session, jsonify, make_response
import pandas as pd
import numpy as np
import json
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')

def clean_data_for_json(data):
    """None 값을 null로 변환하여 JSON 직렬화 문제 해결"""
    cleaned = {}
    for key, values in data.items():
        if key == 'No.':
            cleaned[key] = values
        else:
            cleaned[key] = [None if v is None or v == '' else v for v in values]
    return cleaned

@app.route('/')
def index():
    if 'table_data' not in session:
        default_rows = 10
        session['table_data'] = {
            'No.': list(range(1, default_rows + 1)),
            'size(nm)': [None] * default_rows,
            'PI': [None] * default_rows
        }
    
    clean_table_data = clean_data_for_json(session['table_data'])
    return render_template('index.html',
                         table_data=clean_table_data,
                         sample_name=session.get('sample_name', ''))

@app.route('/health')
def health():
    return {'status': 'healthy'}, 200

@app.route('/update_data', methods=['POST'])
def update_data():
    try:
        data = request.get_json()
        sample_name = data.get('sample_name', '')
        table_data = data.get('table_data', {})
        
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
        
        session['sample_name'] = sample_name
        session['table_data'] = table_data
        
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/add_row', methods=['POST'])
def add_row():
    try:
        table_data = session.get('table_data', {'No.': [], 'size(nm)': [], 'PI': []})
        new_no = len(table_data['No.']) + 1
        
        table_data['No.'].append(new_no)
        table_data['size(nm)'].append(None)
        table_data['PI'].append(None)
        
        session['table_data'] = table_data
        clean_table_data = clean_data_for_json(table_data)
        
        return jsonify({'status': 'success', 'table_data': clean_table_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})

@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        sample_name = session.get('sample_name', 'Sample')
        table_data = session.get('table_data', {})
        
        if not table_data:
            return jsonify({'status': 'error', 'message': '데이터가 없습니다.'})
        
        df = pd.DataFrame(table_data)
        
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
        
        # 이상치 계산
        median = np.median(arr)
        mad = np.median(np.abs(arr - median))
        
        if mad == 0:
            mad_mask = np.zeros(len(arr), dtype=bool)
        else:
            mz = 0.6745 * (arr - median) / mad
            mad_mask = np.abs(mz) > 3.5
        
        q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        iqr_mask = (arr < lower) | (arr > upper)
        
        mu, sigma = np.mean(arr), np.std(arr)
        if sigma == 0:
            z_mask = np.zeros(len(arr), dtype=bool)
        else:
            z = (arr - mu) / sigma
            z_mask = np.abs(z) >= 3
        
        def get_cleaned_stats(mask, name):
            cleaned = valid_df.loc[~mask].reset_index(drop=True)
            cleaned['No.'] = range(1, len(cleaned) + 1)
            
            return {
                'name': name,
                'data': cleaned.to_dict('records'),
                'size_mean': float(cleaned['size(nm)'].mean()) if len(cleaned) > 0 else 0,
                'size_std': float(cleaned['size(nm)'].std()) if len(cleaned) > 0 else 0,
                'pi_mean': float(cleaned['PI'].mean()) if len(cleaned) > 0 else 0,
                'pi_std': float(cleaned['PI'].std()) if len(cleaned) > 0 else 0,
                'count': len(cleaned)
            }
        
        results = {
            'status': 'success',
            'sample_name': sample_name,
            'original_data': valid_df.to_dict('records'),
            'original_count': len(valid_df),
            'zscore': get_cleaned_stats(z_mask, 'Z-Score'),
            'iqr': get_cleaned_stats(iqr_mask, 'IQR'),
            'mad': get_cleaned_stats(mad_mask, 'MAD')
        }
        
        session['last_results'] = results
        return jsonify(results)
        
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
        
        csv_content.append(f"샘플명,{sample_name}")
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
            csv_content.append(f"=== {method_names[method]} 결과 ===")
            csv_content.append(f"처리된 데이터 개수,{method_result['count']}개")
            csv_content.append(f"size(nm) 평균,{method_result['size_mean']:.3f}")
            csv_content.append(f"size(nm) 표준편차,{method_result['size_std']:.3f}")
            csv_content.append(f"PI 평균,{method_result['pi_mean']:.3f}")
            csv_content.append(f"PI 표준편차,{method_result['pi_std']:.3f}")
            csv_content.append("")
            
            cleaned_df = pd.DataFrame(method_result['data'])
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