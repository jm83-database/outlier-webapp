/**
 * Pass Manager Module
 * 패스별 평균값 관리 기능
 */

class PassManager {
    constructor() {
        this.passAverages = [];
        // 페이지 로드 시 초기 설정
        this.initializeCustomFieldLabels();
    }
    
    // 페이지 로드 시 사용자 정의 필드 라벨 초기화
    initializeCustomFieldLabels() {
        // DOM이 준비될 때까지 대기
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => this.setInitialCustomFieldLabels(), 100);
            });
        } else {
            setTimeout(() => this.setInitialCustomFieldLabels(), 100);
        }
    }
    
    setInitialCustomFieldLabels() {
        const customFieldNameInput = document.getElementById('custom_field_name');
        if (customFieldNameInput && customFieldNameInput.value) {
            this.updateCustomFieldLabels(customFieldNameInput.value);
        }
    }

    // 실험군 데이터 추가
    async addExperimentalData() {
        const sampleName = document.getElementById('exp_sample_name_input')?.value;
        const productionDate = document.getElementById('exp_production_date_input')?.value;
        const userRemovalMethod = document.getElementById('exp_removal_method_input')?.value || 'Manual';
        const sizeAvg = document.getElementById('exp_size_avg_input')?.value;
        const piAvg = document.getElementById('exp_pi_avg_input')?.value;
        const customData = document.getElementById('exp_custom_data_input')?.value;
        const customFieldName = document.getElementById('custom_field_name')?.value;
        
        if (!sampleName || !sizeAvg || !piAvg) {
            utils.showNotification('샘플명, Size 평균, PI 평균은 필수 입력 항목입니다.', 'error');
            return;
        }
        
        // 사용자가 선택한 이상치 제거법을 우선 사용
        let removalMethod = userRemovalMethod;
        let thresholdUsed = 'N/A';
        
        // 사용자가 Manual이 아닌 방법을 선택했고, 계산 결과가 있는 경우 임계값 확인
        if (userRemovalMethod !== 'Manual' && window.chartHandler && window.chartHandler.lastCalculationResult) {
            const calculationResult = window.chartHandler.lastCalculationResult;
            const methodMap = { 'Z-Score': 'zscore', 'IQR': 'iqr', 'MAD': 'mad' };
            const selectedMethodKey = methodMap[userRemovalMethod];
            
            if (selectedMethodKey && calculationResult[selectedMethodKey]) {
                const methodResult = calculationResult[selectedMethodKey];
                const sizeDiff = Math.abs(methodResult.size_mean - parseFloat(sizeAvg));
                const piDiff = Math.abs(methodResult.pi_mean - parseFloat(piAvg));
                
                // 선택한 방법의 결과와 일치하는지 확인 (정밀한 매칭)
                if (sizeDiff < 0.0005 && piDiff < 0.0005) {
                    thresholdUsed = methodResult.threshold.toString();
                }
            }
        }
        
        // 사용자가 Manual을 선택했지만 계산 결과와 정확히 일치하는 경우에만 자동 감지
        if (userRemovalMethod === 'Manual' && window.chartHandler && window.chartHandler.lastCalculationResult) {
            const calculationResult = window.chartHandler.lastCalculationResult;
            const methods = ['zscore', 'iqr', 'mad'];
            const methodNames = { 'zscore': 'Z-Score', 'iqr': 'IQR', 'mad': 'MAD' };
            
            let bestMatch = null;
            let bestMatchDiff = Infinity;
            
            for (const method of methods) {
                const methodResult = calculationResult[method];
                if (methodResult) {
                    const sizeDiff = Math.abs(methodResult.size_mean - parseFloat(sizeAvg));
                    const piDiff = Math.abs(methodResult.pi_mean - parseFloat(piAvg));
                    const totalDiff = sizeDiff + piDiff;
                    
                    // 매우 정밀한 매칭 (소수점 3자리까지)
                    if (sizeDiff < 0.0005 && piDiff < 0.0005 && totalDiff < bestMatchDiff) {
                        bestMatchDiff = totalDiff;
                        bestMatch = {
                            method: methodNames[method],
                            threshold: methodResult.threshold.toString()
                        };
                    }
                }
            }
            
            if (bestMatch) {
                removalMethod = bestMatch.method;
                thresholdUsed = bestMatch.threshold;
            }
        }
        
        const requestData = {
            sample_name: sampleName,
            production_date: productionDate,
            size_avg: parseFloat(sizeAvg),
            pi_avg: parseFloat(piAvg),
            removal_method: removalMethod,
            threshold_used: thresholdUsed,
            custom_data_name: customFieldName
        };
        
        if (customData && customData.trim() !== '') {
            requestData.custom_data_value = parseFloat(customData);
        }
        
        try {
            const result = await utils.apiRequest('/add_experimental_data', requestData, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                
                // 입력 필드 초기화
                this.generateNextSampleName('exp');
                document.getElementById('exp_production_date_input').value = '';
                document.getElementById('exp_removal_method_input').value = 'Manual';
                document.getElementById('exp_size_avg_input').value = '';
                document.getElementById('exp_pi_avg_input').value = '';
                document.getElementById('exp_custom_data_input').value = '';
                
                this.renderExperimentalTable(result.experimental_data);
                
                // 사용자 정의 필드명 업데이트
                if (result.custom_data_field_name) {
                    this.updateCustomFieldLabels(result.custom_data_field_name);
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('실험군 데이터 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 대조군 데이터 추가
    async addControlData() {
        const sampleName = document.getElementById('ctrl_sample_name_input')?.value;
        const sizeAvg = document.getElementById('ctrl_size_avg_input')?.value;
        const piAvg = document.getElementById('ctrl_pi_avg_input')?.value;
        const customData = document.getElementById('ctrl_custom_data_input')?.value;
        const customFieldName = document.getElementById('custom_field_name')?.value;
        
        if (!sampleName || !sizeAvg || !piAvg) {
            utils.showNotification('샘플명, Size 평균, PI 평균은 필수 입력 항목입니다.', 'error');
            return;
        }
        
        const requestData = {
            sample_name: sampleName,
            size_avg: parseFloat(sizeAvg),
            pi_avg: parseFloat(piAvg),
            custom_data_name: customFieldName
        };
        
        if (customData && customData.trim() !== '') {
            requestData.custom_data_value = parseFloat(customData);
        }
        
        try {
            const result = await utils.apiRequest('/add_control_data', requestData, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                
                // 입력 필드 초기화
                this.generateNextSampleName('ctrl');
                document.getElementById('ctrl_size_avg_input').value = '';
                document.getElementById('ctrl_pi_avg_input').value = '';
                document.getElementById('ctrl_custom_data_input').value = '';
                
                this.renderControlTable(result.control_data);
                
                // 사용자 정의 필드명 업데이트
                if (result.custom_data_field_name) {
                    this.updateCustomFieldLabels(result.custom_data_field_name);
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('대조군 데이터 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 샘플명 자동 생성 (데이터 추가 후에만 호출)
    generateNextSampleName(type) {
        const defaultSampleName = document.getElementById('default_sample_name')?.value || 'Sample';
        const inputId = type === 'exp' ? 'exp_sample_name_input' : 'ctrl_sample_name_input';
        const input = document.getElementById(inputId);
        
        if (!input) return;
        
        // 사용자가 직접 입력 중인지 확인
        if (document.activeElement === input) {
            return; // 사용자가 입력 중이면 자동 생성하지 않음
        }
        
        // 사용자가 입력한 기본 샘플명만 사용 (접미사 없음)
        input.value = defaultSampleName;
    }

    // 사용자 정의 필드 라벨 업데이트
    updateCustomFieldLabels(fieldName) {
        // 실험군/대조군 라벨 업데이트
        const expLabel = document.getElementById('exp_custom_label');
        const ctrlLabel = document.getElementById('ctrl_custom_label');
        
        if (expLabel) {
            expLabel.textContent = fieldName;
        }
        if (ctrlLabel) {
            ctrlLabel.textContent = fieldName;
        }
        
        // 테이블 헤더 업데이트
        const expCustomFieldHeader = document.getElementById('exp_custom_field_header');
        const ctrlCustomFieldHeader = document.getElementById('ctrl_custom_field_header');
        
        if (expCustomFieldHeader) {
            expCustomFieldHeader.textContent = fieldName;
        }
        if (ctrlCustomFieldHeader) {
            ctrlCustomFieldHeader.textContent = fieldName;
        }
        
        // 상관관계 분석 버튼 텍스트 업데이트
        const correlationAnalysisBtn = document.getElementById('correlation_analysis_btn_text');
        if (correlationAnalysisBtn) {
            correlationAnalysisBtn.textContent = `${fieldName} 상관관계 분석`;
        }
    }

    // 기존 단일 그룹 추가 함수 (호환성 유지)
    async addPassAverage() {
        // 새로운 UI가 있는 경우 동시 추가 함수 사용
        if (document.getElementById('exp_size_avg_input')) {
            return this.addBothGroupsAverage();
        }
        
        // 기존 코드 로직 유지 (만약 이전 UI가 남아있는 경우)
        const passNumber = document.getElementById('pass_number_input')?.value;
        const groupType = document.getElementById('group_type_select')?.value || 'experimental';
        const sizeAvg = document.getElementById('size_avg_input')?.value;
        const piAvg = document.getElementById('pi_avg_input')?.value;
        const customData = document.getElementById('custom_data_input')?.value;
        const customFieldName = document.getElementById('custom_field_name')?.value;
        
        if (!passNumber || !sizeAvg || !piAvg) {
            utils.showNotification('패스 번호, Size 평균, PI 평균은 필수 입력 항목입니다.', 'error');
            return;
        }
        
        const requestData = {
            pass_number: parseInt(passNumber),
            group_type: groupType,
            size_avg: parseFloat(sizeAvg),
            pi_avg: parseFloat(piAvg),
            removal_method: 'Manual',
            threshold_used: 'N/A',
            custom_data_name: customFieldName
        };
        
        if (customData && customData.trim() !== '') {
            requestData.custom_data_value = parseFloat(customData);
        }
        
        try {
            const result = await utils.apiRequest('/add_pass_average', requestData, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                
                document.getElementById('pass_number_input').value = '';
                document.getElementById('size_avg_input').value = '';
                document.getElementById('pi_avg_input').value = '';
                document.getElementById('custom_data_input').value = '';
                
                this.renderPassAveragesTable(result.pass_averages);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('패스 평균값 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 계산 결과에서 평균값 추가 (입력 폼에 값 채우기)
    addFromCurrentResult() {
        // chartHandler에서 계산 결과 확인
        if (!window.chartHandler || !window.chartHandler.lastCalculationResult) {
            utils.showNotification('계산 결과가 없습니다. 먼저 이상치 검출을 실행해주세요.', 'error');
            return;
        }
        
        const calculationResult = window.chartHandler.lastCalculationResult;
        
        // 사용자가 선택한 방법 가져오기
        const selectedMethod = document.getElementById('methodSelector')?.value || 'zscore';
        const methodResult = calculationResult[selectedMethod];
        
        if (!methodResult) {
            utils.showNotification(`${selectedMethod} 결과를 찾을 수 없습니다.`, 'error');
            return;
        }
        
        // 방법명 매핑
        const methodNames = {
            'zscore': 'Z-Score',
            'iqr': 'IQR', 
            'mad': 'MAD'
        };
        
        // 샘플명 생성 (기본 샘플명만 사용)
        const defaultSampleName = document.getElementById('default_sample_name')?.value || 'Sample';
        
        // 실험군 입력 폼에 값 채우기
        const expSampleNameInput = document.getElementById('exp_sample_name_input');
        const expSizeAvgInput = document.getElementById('exp_size_avg_input');
        const expPiAvgInput = document.getElementById('exp_pi_avg_input');
        const expCustomDataInput = document.getElementById('exp_custom_data_input');
        
        if (expSampleNameInput) {
            expSampleNameInput.value = defaultSampleName;
        }
        if (expSizeAvgInput) {
            expSizeAvgInput.value = methodResult.size_mean.toFixed(3);
        }
        if (expPiAvgInput) {
            expPiAvgInput.value = methodResult.pi_mean.toFixed(3);
        }
        if (expCustomDataInput) {
            expCustomDataInput.value = ''; // 사용자가 직접 입력하도록 비움
            expCustomDataInput.focus(); // 사용자 정의 필드에 포커스
        }
        
        // 입력 폼 영역으로 스크롤
        const expInputSection = document.querySelector('.mb-6.p-6.bg-gradient-to-br.from-blue-50.to-blue-100');
        if (expInputSection) {
            expInputSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        utils.showNotification(`${methodNames[selectedMethod]} 결과가 실험군 입력 폼에 채워졌습니다. 사용자 정의 필드값을 입력한 후 "실험군 추가" 버튼을 클릭하세요.`, 'success');
    }

    // 실험군 데이터 삭제
    async deleteExperimentalData(sampleName) {
        if (!confirm(`실험군 샘플 "${sampleName}"을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const result = await utils.apiRequest('/delete_pass_average', { 
                sample_name: sampleName,
                group_type: 'experimental'
            }, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                // 실험군 데이터만 필터링하여 렌더링
                const experimentalData = result.pass_averages.filter(p => p.group_type === 'experimental');
                this.renderExperimentalTable(experimentalData);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('실험군 데이터 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 대조군 데이터 삭제
    async deleteControlData(sampleName) {
        if (!confirm(`대조군 샘플 "${sampleName}"을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const result = await utils.apiRequest('/delete_control_data', { 
                sample_name: sampleName
            }, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                this.renderControlTable(result.control_data);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('대조군 데이터 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 기존 패스 평균값 삭제 (호환성 유지)
    async deletePassAverage(passNumber, groupType) {
        if (groupType === 'experimental') {
            return this.deleteExperimentalData(passNumber);
        } else if (groupType === 'control') {
            // 대조군의 경우 pass_number 대신 control_id를 사용해야 하므로 
            // 실제로는 이 경로가 사용되지 않을 것임
            return this.deleteControlData(passNumber);
        }
    }

    // 모든 데이터 삭제
    async clearAllData() {
        if (!confirm('모든 실험군 및 대조군 데이터를 삭제하시겠습니까?')) {
            return;
        }

        try {
            let deleteCount = 0;
            
            // 실험군 데이터 삭제
            const expTbody = document.getElementById('experimentalBody');
            if (expTbody) {
                const expRows = expTbody.querySelectorAll('tr');
                for (const row of expRows) {
                    const passNumber = row.querySelector('td')?.textContent;
                    if (passNumber && passNumber !== '등록된 실험군 데이터가 없습니다.') {
                        await utils.apiRequest('/delete_pass_average', { 
                            pass_number: parseInt(passNumber),
                            group_type: 'experimental'
                        }, 'POST');
                        deleteCount++;
                    }
                }
            }
            
            // 대조군 데이터 삭제
            const ctrlTbody = document.getElementById('controlBody');
            if (ctrlTbody) {
                const ctrlRows = ctrlTbody.querySelectorAll('tr');
                for (const row of ctrlRows) {
                    const controlId = row.querySelector('td')?.textContent;
                    if (controlId && controlId !== '등록된 대조군 데이터가 없습니다.') {
                        await utils.apiRequest('/delete_control_data', { 
                            control_id: controlId
                        }, 'POST');
                        deleteCount++;
                    }
                }
            }
            
            // 테이블 초기화
            this.renderExperimentalTable([]);
            this.renderControlTable([]);
            
            utils.showNotification(`총 ${deleteCount}개의 데이터가 삭제되었습니다.`, 'success');
        } catch (error) {
            utils.showNotification('데이터 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 기존 함수 (호환성 유지)
    async clearAllPasses() {
        return this.clearAllData();
    }

    // 실험군 테이블 렌더링
    renderExperimentalTable(experimentalData) {
        const tbody = document.getElementById('experimentalBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!experimentalData || experimentalData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">등록된 실험군 데이터가 없습니다.</td></tr>';
            return;
        }
        
        // 샘플명 순으로 정렬
        const sortedData = experimentalData.sort((a, b) => a.sample_name.localeCompare(b.sample_name));
        
        sortedData.forEach(sample => {
            const row = tbody.insertRow();
            row.className = 'hover:bg-blue-50 transition-colors duration-200';
            
            row.innerHTML = `
                <td class="px-4 py-3 text-center font-medium">${sample.sample_name}</td>
                <td class="px-4 py-3 text-center text-sm">${sample.production_date || '-'}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 text-xs rounded-full ${
                        sample.removal_method === 'Z-Score' ? 'bg-blue-100 text-blue-800' :
                        sample.removal_method === 'IQR' ? 'bg-green-100 text-green-800' :
                        sample.removal_method === 'MAD' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                    }">
                        ${sample.removal_method}
                    </span>
                    ${sample.threshold_used !== 'N/A' ? `<br><span class="text-xs text-gray-500">(${sample.threshold_used})</span>` : ''}
                </td>
                <td class="px-4 py-3 text-center">${sample.size_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${sample.pi_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${sample.custom_data_value !== null && sample.custom_data_value !== undefined ? sample.custom_data_value.toFixed(1) : '-'}</td>
                <td class="px-4 py-3 text-center text-xs text-gray-500">${sample.timestamp}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="passManager.deleteExperimentalData('${sample.sample_name}')" 
                            class="text-red-600 hover:text-red-800 text-sm font-medium transition-colors duration-200">
                        삭제
                    </button>
                </td>
            `;
        });
    }

    // 대조군 테이블 렌더링
    renderControlTable(controlData) {
        const tbody = document.getElementById('controlBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!controlData || controlData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-500">등록된 대조군 데이터가 없습니다.</td></tr>';
            return;
        }
        
        // 샘플명 순으로 정렬
        const sortedData = controlData.sort((a, b) => a.sample_name.localeCompare(b.sample_name));
        
        sortedData.forEach(control => {
            const row = tbody.insertRow();
            row.className = 'hover:bg-green-50 transition-colors duration-200';
            
            row.innerHTML = `
                <td class="px-4 py-3 text-center font-medium">${control.sample_name}</td>
                <td class="px-4 py-3 text-center">${control.size_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${control.pi_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${control.custom_data_value !== null && control.custom_data_value !== undefined ? control.custom_data_value.toFixed(1) : '-'}</td>
                <td class="px-4 py-3 text-center text-xs text-gray-500">${control.timestamp}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="passManager.deleteControlData('${control.sample_name}')" 
                            class="text-red-600 hover:text-red-800 text-sm font-medium transition-colors duration-200">
                        삭제
                    </button>
                </td>
            `;
        });
    }

    // 기존 테이블 렌더링 (호환성 유지)
    renderPassAveragesTable(passAverages) {
        // 실험군과 대조군 분리
        const experimentalData = passAverages.filter(p => p.group_type === 'experimental');
        const controlData = passAverages.filter(p => p.group_type === 'control');
        
        this.renderExperimentalTable(experimentalData);
        this.renderControlTable(controlData);
    }

    // 트렌드 분석 표시
    async showTrendAnalysis() {
        try {
            const result = await utils.apiRequest('/get_pass_trend_data');
            
            if (result.status === 'error') {
                utils.showNotification(result.message, 'error');
                return;
            }
            
            this.displayTrendResults(result);
        } catch (error) {
            utils.showNotification('트렌드 분석 중 오류가 발생했습니다.', 'error');
        }
    }

    // 트렌드 분석 결과 표시
    displayTrendResults(data) {
        // 기존 트렌드 결과 div 찾기 또는 생성
        let trendDiv = document.getElementById('trend_results');
        if (!trendDiv) {
            trendDiv = document.createElement('div');
            trendDiv.id = 'trend_results';
            trendDiv.className = 'mt-8';
            
            // 패스 관리 섹션 다음에 추가
            const passSection = document.querySelector('.bg-white\\/70.backdrop-blur-sm.rounded-2xl.shadow-xl.p-8.mb-8.border.border-white\\/20');
            if (passSection && passSection.nextElementSibling) {
                passSection.parentNode.insertBefore(trendDiv, passSection.nextElementSibling);
            } else {
                document.body.appendChild(trendDiv);
            }
        }
        
        trendDiv.innerHTML = `
            <div class="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                        </svg>
                    </div>
                    샘플별 트렌드 분석 결과
                </h2>
                
                <!-- 통계 요약 -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <div class="text-2xl font-bold text-blue-600">${data.statistics.pass_count}</div>
                        <div class="text-sm text-gray-600">총 샘플 수</div>
                    </div>
                    <div class="bg-green-50 p-4 rounded-xl border border-green-200">
                        <div class="text-2xl font-bold text-green-600">${data.statistics.correlation.toFixed(3)}</div>
                        <div class="text-sm text-gray-600">Size-PI 상관계수</div>
                    </div>
                    <div class="bg-purple-50 p-4 rounded-xl border border-purple-200">
                        <div class="text-2xl font-bold text-purple-600">${data.statistics.size_cv.toFixed(1)}%</div>
                        <div class="text-sm text-gray-600">Size 변동계수</div>
                    </div>
                    <div class="bg-orange-50 p-4 rounded-xl border border-orange-200">
                        <div class="text-2xl font-bold text-orange-600">${data.statistics.pi_cv.toFixed(1)}%</div>
                        <div class="text-sm text-gray-600">PI 변동계수</div>
                    </div>
                </div>

                <!-- 차트들 -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div class="bg-gray-50 rounded-xl p-6">
                        <div id="size_trend_chart"></div>
                    </div>
                    <div class="bg-gray-50 rounded-xl p-6">
                        <div id="pi_trend_chart"></div>
                    </div>
                </div>
                
                <div class="bg-gray-50 rounded-xl p-6">
                    <div id="correlation_chart"></div>
                </div>
            </div>
        `;

        // 차트 렌더링
        if (data.size_trend_chart) {
            const sizeChartData = JSON.parse(data.size_trend_chart);
            Plotly.newPlot('size_trend_chart', sizeChartData.data, sizeChartData.layout, {responsive: true});
        }
        
        if (data.pi_trend_chart) {
            const piChartData = JSON.parse(data.pi_trend_chart);
            Plotly.newPlot('pi_trend_chart', piChartData.data, piChartData.layout, {responsive: true});
        }
        
        if (data.correlation_chart) {
            const corrChartData = JSON.parse(data.correlation_chart);
            Plotly.newPlot('correlation_chart', corrChartData.data, corrChartData.layout, {responsive: true});
        }

        trendDiv.scrollIntoView({ behavior: 'smooth' });
    }
}

// 전역 인스턴스 생성
window.passManager = new PassManager();

// 전역 함수들
window.addExperimentalData = () => passManager.addExperimentalData();
window.addControlData = () => passManager.addControlData();
window.addFromCurrentResult = () => passManager.addFromCurrentResult();
window.clearAllData = () => passManager.clearAllData();
window.showTrendAnalysis = () => passManager.showTrendAnalysis();
window.updateCustomFieldName = () => {
    const customFieldName = document.getElementById('custom_field_name')?.value;
    if (customFieldName) {
        passManager.updateCustomFieldLabels(customFieldName);
    }
};

// 기본 샘플명 업데이트 함수 (사용자 정의 샘플명 변경 시에만 자동 생성)
window.updateDefaultSampleName = () => {
    // 사용자가 입력 중이면 자동 생성하지 않음
    const expInput = document.getElementById('exp_sample_name_input');
    const ctrlInput = document.getElementById('ctrl_sample_name_input');
    
    // 입력 필드가 비어있거나 포커스가 없을 때만 자동 생성
    if (expInput && (!expInput.value || !document.activeElement || document.activeElement.id !== 'exp_sample_name_input')) {
        passManager.generateNextSampleName('exp');
    }
    if (ctrlInput && (!ctrlInput.value || !document.activeElement || document.activeElement.id !== 'ctrl_sample_name_input')) {
        passManager.generateNextSampleName('ctrl');
    }
};

// 기존 호환성 유지
window.addPassAverage = () => passManager.addPassAverage();
window.clearAllPasses = () => passManager.clearAllPasses();