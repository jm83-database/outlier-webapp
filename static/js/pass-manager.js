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

    // 두 그룹 동시 평균값 추가
    async addBothGroupsAverage() {
        const passNumber = document.getElementById('pass_number_input')?.value;
        const customFieldName = document.getElementById('custom_field_name')?.value;
        
        // 실험군 데이터
        const expSizeAvg = document.getElementById('exp_size_avg_input')?.value;
        const expPiAvg = document.getElementById('exp_pi_avg_input')?.value;
        const expCustomData = document.getElementById('exp_custom_data_input')?.value;
        
        // 대조군 데이터
        const ctrlSizeAvg = document.getElementById('ctrl_size_avg_input')?.value;
        const ctrlPiAvg = document.getElementById('ctrl_pi_avg_input')?.value;
        const ctrlCustomData = document.getElementById('ctrl_custom_data_input')?.value;
        
        if (!passNumber) {
            utils.showNotification('패스 번호는 필수 입력 항목입니다.', 'error');
            return;
        }
        
        // 최소 한 그룹의 완전한 데이터 확인
        const expComplete = expSizeAvg && expPiAvg;
        const ctrlComplete = ctrlSizeAvg && ctrlPiAvg;
        
        if (!expComplete && !ctrlComplete) {
            utils.showNotification('최소 한 그룹의 Size와 PI 데이터는 필수입니다.', 'error');
            return;
        }
        
        const requestData = {
            pass_number: parseInt(passNumber),
            custom_data_name: customFieldName,
            experimental: {},
            control: {}
        };
        
        // 실험군 데이터 추가
        if (expComplete) {
            requestData.experimental = {
                size_avg: parseFloat(expSizeAvg),
                pi_avg: parseFloat(expPiAvg)
            };
            if (expCustomData && expCustomData.trim() !== '') {
                requestData.experimental.custom_data_value = parseFloat(expCustomData);
            }
        }
        
        // 대조군 데이터 추가
        if (ctrlComplete) {
            requestData.control = {
                size_avg: parseFloat(ctrlSizeAvg),
                pi_avg: parseFloat(ctrlPiAvg)
            };
            if (ctrlCustomData && ctrlCustomData.trim() !== '') {
                requestData.control.custom_data_value = parseFloat(ctrlCustomData);
            }
        }
        
        try {
            const result = await utils.apiRequest('/add_both_groups_pass_average', requestData, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                
                // 입력 필드 초기화
                document.getElementById('pass_number_input').value = '';
                document.getElementById('exp_size_avg_input').value = '';
                document.getElementById('exp_pi_avg_input').value = '';
                document.getElementById('exp_custom_data_input').value = '';
                document.getElementById('ctrl_size_avg_input').value = '';
                document.getElementById('ctrl_pi_avg_input').value = '';
                document.getElementById('ctrl_custom_data_input').value = '';
                
                this.renderPassAveragesTable(result.pass_averages);
                
                // 사용자 정의 필드명 업데이트
                if (result.custom_data_field_name) {
                    this.updateCustomFieldLabels(result.custom_data_field_name);
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('패스 평균값 추가 중 오류가 발생했습니다.', 'error');
        }
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
        const customFieldHeader = document.getElementById('custom_field_header');
        if (customFieldHeader) {
            customFieldHeader.textContent = fieldName;
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

    // 계산 결과에서 평균값 추가
    async addFromCurrentResult() {
        if (!chartHandler.lastCalculationResult) {
            utils.showNotification('계산 결과가 없습니다. 먼저 이상치 검출을 실행해주세요.', 'error');
            return;
        }
        
        // Z-score 결과를 기본으로 사용 (가장 일반적)
        const zscore = chartHandler.lastCalculationResult.zscore;
        const currentPass = document.getElementById('pass_count')?.value || 1;
        const customFieldName = document.getElementById('custom_field_name')?.value;
        
        try {
            const requestData = {
                pass_number: parseInt(currentPass),
                group_type: 'experimental', // 계산 결과는 기본적으로 실험군으로 추가
                size_avg: zscore.size_mean,
                pi_avg: zscore.pi_mean,
                removal_method: 'Z-Score',
                threshold_used: zscore.threshold.toString(),
                custom_data_name: customFieldName
            };

            const result = await utils.apiRequest('/add_pass_average', requestData, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                this.renderPassAveragesTable(result.pass_averages);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('계산 결과 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 패스 평균값 삭제
    async deletePassAverage(passNumber, groupType) {
        const groupName = groupType === 'experimental' ? '실험군' : '대조군';
        if (!confirm(`패스 ${passNumber} ${groupName}을 삭제하시겠습니까?`)) {
            return;
        }

        try {
            const result = await utils.apiRequest('/delete_pass_average', { 
                pass_number: passNumber,
                group_type: groupType
            }, 'POST');
            
            if (result.status === 'success') {
                utils.showNotification(result.message, 'success');
                this.renderPassAveragesTable(result.pass_averages);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('패스 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 모든 패스 삭제
    async clearAllPasses() {
        if (!confirm('모든 패스 데이터를 삭제하시겠습니까?')) {
            return;
        }

        try {
            // 각 패스를 개별적으로 삭제 (일괄 삭제 API가 없는 경우)
            const tbody = document.getElementById('passAveragesBody');
            const rows = tbody.querySelectorAll('tr');
            
            for (const row of rows) {
                const passNumber = row.querySelector('td')?.textContent;
                if (passNumber && passNumber !== '등록된 패스별 평균값이 없습니다.') {
                    await utils.apiRequest('/delete_pass_average', { pass_number: parseInt(passNumber) }, 'POST');
                }
            }
            
            this.renderPassAveragesTable([]);
            utils.showNotification('모든 패스 데이터가 삭제되었습니다.', 'success');
        } catch (error) {
            utils.showNotification('패스 데이터 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // 패스별 평균값 테이블 렌더링
    renderPassAveragesTable(passAverages) {
        const tbody = document.getElementById('passAveragesBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (!passAverages || passAverages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">등록된 패스별 평균값이 없습니다.</td></tr>';
            return;
        }
        
        // 패스 번호 순으로 정렬
        const sortedPasses = passAverages.sort((a, b) => a.pass_number - b.pass_number);
        
        sortedPasses.forEach(pass => {
            const row = tbody.insertRow();
            row.className = 'hover:bg-purple-50 transition-colors duration-200';
            
            const groupType = pass.group_type || 'experimental';
            const groupName = groupType === 'experimental' ? '실험군' : '대조군';
            const groupColor = groupType === 'experimental' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
            
            row.innerHTML = `
                <td class="px-4 py-3 text-center font-medium">${pass.pass_number}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 text-xs rounded-full ${groupColor}">
                        ${groupName}
                    </span>
                </td>
                <td class="px-4 py-3 text-center">${pass.size_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${pass.pi_avg.toFixed(3)}</td>
                <td class="px-4 py-3 text-center">${pass.custom_data_value !== null && pass.custom_data_value !== undefined ? pass.custom_data_value.toFixed(1) : '-'}</td>
                <td class="px-4 py-3 text-center">
                    <span class="px-2 py-1 text-xs rounded-full ${
                        pass.removal_method === 'Z-Score' ? 'bg-blue-100 text-blue-800' :
                        pass.removal_method === 'IQR' ? 'bg-green-100 text-green-800' :
                        pass.removal_method === 'MAD' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                    }">
                        ${pass.removal_method}
                    </span>
                    ${pass.threshold_used !== 'N/A' ? `<br><span class="text-xs text-gray-500">(${pass.threshold_used})</span>` : ''}
                </td>
                <td class="px-4 py-3 text-center text-xs text-gray-500">${pass.timestamp}</td>
                <td class="px-4 py-3 text-center">
                    <button onclick="passManager.deletePassAverage(${pass.pass_number}, '${groupType}')" 
                            class="text-red-600 hover:text-red-800 text-sm font-medium transition-colors duration-200">
                        삭제
                    </button>
                </td>
            `;
        });
        
        this.passAverages = passAverages;
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
                    패스별 트렌드 분석 결과
                </h2>
                
                <!-- 통계 요약 -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                        <div class="text-2xl font-bold text-blue-600">${data.statistics.pass_count}</div>
                        <div class="text-sm text-gray-600">총 패스 수</div>
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

// 전역 함수들 (기존 호환성 위해 유지)
window.addPassAverage = () => passManager.addPassAverage();
window.addBothGroupsAverage = () => passManager.addBothGroupsAverage();
window.addFromCurrentResult = () => passManager.addFromCurrentResult();
window.clearAllPasses = () => passManager.clearAllPasses();
window.showTrendAnalysis = () => passManager.showTrendAnalysis();