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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=False)