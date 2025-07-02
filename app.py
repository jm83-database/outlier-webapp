from flask import Flask, render_template, request, session, jsonify, make_response
import pandas as pd
import numpy as np
import json
from datetime import datetime

app = Flask(__name__)


# JSON 직렬화를 위한 커스텀 필터 추가
@app.template_filter('to_json')
def to_json_filter(obj):
    return json.dumps(obj)


def clean_data_for_json(data):
    """None 값을 null로 변환하여 JSON 직렬화 문제 해결"""
    cleaned = {}
    for key, values in data.items():
        if key == 'No.':
            cleaned[key] = values  # 번호는 그대로
        else:
            # None 값을 null로 변환 (JavaScript에서 안전하게 처리)
            cleaned[key] = [None if v is None or v == '' else v for v in values]
    return cleaned


@app.route('/')
def index():
    # 세션에 기본 데이터가 없으면 초기화
    if 'table_data' not in session:
        default_rows = 20
        session['table_data'] = {
            'No.': list(range(1, default_rows + 1)),
            'size(nm)': [None] * default_rows,
            'PI': [None] * default_rows
        }

    # JSON 직렬화를 위해 None 값을 빈 문자열로 변환
    clean_table_data = clean_data_for_json(session['table_data'])

    return render_template('index.html',
                           table_data=clean_table_data,
                           sample_name=session.get('sample_name', ''))


@app.route('/update_data', methods=['POST'])
def update_data():
    try:
        data = request.get_json()
        sample_name = data.get('sample_name', '')
        table_data = data.get('table_data', {})

        # 데이터 정리: 빈 문자열이나 유효하지 않은 값을 None으로 변환
        for key in ['size(nm)', 'PI']:
            if key in table_data:
                cleaned_values = []
                for v in table_data[key]:



2


최 진명


                    if v is None or v == '' or (isinstance(v, str) and v.strip() == ''):
                        cleaned_values.append(None)
                    else:
                        try:
                            cleaned_values.append(float(v))
                        except (ValueError, TypeError):
                            cleaned_values.append(None)
                table_data[key] = cleaned_values

        # 세션에 저장
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

        # JSON 응답을 위해 None을 빈 문자열로 변환
        clean_table_data = clean_data_for_json(table_data)

        return jsonify({'status': 'success', 'table_data': clean_table_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


@app.route('/remove_row', methods=['POST'])
def remove_row():
    try:
        data = request.get_json()
        row_index = data.get('row_index', -1)

        table_data = session.get('table_data', {'No.': [], 'size(nm)': [], 'PI': []})

        if 0 <= row_index < len(table_data['No.']):
            table_data['No.'].pop(row_index)
            table_data['size(nm)'].pop(row_index)
            table_data['PI'].pop(row_index)

            # 번호 다시 매기기
            table_data['No.'] = list(range(1, len(table_data['No.']) + 1))

            session['table_data'] = table_data

        # JSON 응답을 위해 None을 빈 문자열로 변환
        clean_table_data = clean_data_for_json(table_data)

        return jsonify({'status': 'success', 'table_data': clean_table_data})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


@app.route('/calculate', methods=['POST'])
def calculate():
    try:
        sample_name = session.get('sample_name', '')
        table_data = session.get('table_data', {})

        # DataFrame 생성
        df = pd.DataFrame(table_data)

        # 유효 데이터만 추출
        valid_data = []
        for i in range(len(df)):
            size_val = df.iloc[i]['size(nm)']
            pi_val = df.iloc[i]['PI']

            # 유효한 숫자인지 확인
            try:
                if size_val is not None and pi_val is not None:
                    size_float = float(size_val)
                    pi_float = float(pi_val)
                    # NaN이나 무한대가 아닌지 확인
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
        results = {}

        # MAD
        median = np.median(arr)
        mad = np.median(np.abs(arr - median))
        if mad == 0:
            mad_mask = np.zeros(len(arr), dtype=bool)
        else:
            mz = 0.6745 * (arr - median) / mad
            mad_mask = np.abs(mz) > 3.5

        # IQR
        q1, q3 = np.percentile(arr, 25), np.percentile(arr, 75)
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        iqr_mask = (arr < lower) | (arr > upper)

        # z-score
        mu, sigma = np.mean(arr), np.std(arr)
        if sigma == 0:
            z_mask = np.zeros(len(arr), dtype=bool)
        else:
            z = (arr - mu) / sigma
            z_mask = np.abs(z) >= 3

        # 결과 정리
        def get_cleaned_stats(mask, name):
            cleaned = valid_df.loc[~mask].reset_index(drop=True)
            cleaned['No.'] = range(1, len(cleaned) + 1)

            return {
                'name': name,
                'data': cleaned.to_dict('records'),
                'size_mean': float(cleaned['size(nm)'].mean()),
                'size_std': float(cleaned['size(nm)'].std()),
                'pi_mean': float(cleaned['PI'].mean()),
                'pi_std': float(cleaned['PI'].std()),
                'count': len(cleaned)
            }

        results = {
            'status': 'success',
            'sample_name': sample_name,
            'original_data': valid_df.to_dict('records'),
            'original_count': len(valid_df),
            'zscore': get_cleaned_stats(z_mask, 'z-score'),
            'iqr': get_cleaned_stats(iqr_mask, 'IQR'),
            'mad': get_cleaned_stats(mad_mask, 'MAD')
        }

        # 결과를 세션에 저장 (CSV 다운로드용)
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

        # CSV 내용 생성
        csv_content = []
        sample_name = results.get('sample_name', '샘플')

        # 헤더 정보
        csv_content.append(f"샘플명,{sample_name}")
        csv_content.append(f"계산일시,{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        csv_content.append("")  # 빈 줄

        # 원본 데이터
        csv_content.append("=== 원본 데이터 ===")
        original_df = pd.DataFrame(results['original_data'])
        csv_content.append(f"총 {results['original_count']}개 데이터")
        csv_content.append("")

        # 원본 데이터를 CSV 문자열로 변환 (UTF-8 BOM 없이)
        original_csv = original_df.to_csv(index=False, encoding='utf-8')
        csv_content.append(original_csv.strip())
        csv_content.append("")
        csv_content.append("")

        # 각 방법별 결과
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

            # 정리된 데이터
            cleaned_df = pd.DataFrame(method_result['data'])
            cleaned_csv = cleaned_df.to_csv(index=False, encoding='utf-8')
            csv_content.append(cleaned_csv.strip())
            csv_content.append("")
            csv_content.append("")

        # 최종 CSV 문자열 생성
        final_csv = '\n'.join(csv_content)

        # UTF-8 BOM 추가하여 인코딩
        final_csv_bytes = '\ufeff' + final_csv  # BOM 추가

        # 응답 생성
        response = make_response(final_csv_bytes.encode('utf-8'))
        response.headers['Content-Type'] = 'text/csv; charset=utf-8'

        # 파일명도 URL 인코딩
        import urllib.parse
        filename = f"outlier_results_{sample_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        encoded_filename = urllib.parse.quote(filename.encode('utf-8'))

        response.headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded_filename}"

        return response

    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)})


if __name__ == '__main__':
    app.run(debug=False)