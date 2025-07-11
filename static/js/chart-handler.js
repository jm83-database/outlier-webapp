/**
 * Chart Handler Module
 * 차트 생성 및 시각화 관련 기능
 */

class ChartHandler {
    constructor() {
        this.lastCalculationResult = null;
    }

    // 이상치 검출 및 계산
    async calculateWithThresholds() {
        const calculateBtn = document.querySelector('button[onclick="calculateWithThresholds()"]');
        const originalText = calculateBtn?.innerHTML;
        
        try {
            // 로딩 상태 설정
            if (calculateBtn) {
                calculateBtn.disabled = true;
                calculateBtn.innerHTML = '<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>계산 중...';
            }

            // 임계값 수집
            const thresholds = {
                zscore: parseFloat(document.getElementById('zscore_threshold')?.value || 3.0),
                iqr: parseFloat(document.getElementById('iqr_threshold')?.value || 1.5),
                mad: parseFloat(document.getElementById('mad_threshold')?.value || 3.5)
            };

            const result = await utils.apiRequest('/calculate_with_thresholds', { thresholds }, 'POST');

            if (result.status === 'success') {
                this.lastCalculationResult = result;
                this.displayResults(result);
                
                // 계산 결과 추가 버튼 표시
                const addFromResultBtn = document.getElementById('addFromResultBtn');
                if (addFromResultBtn) {
                    addFromResultBtn.classList.remove('hidden');
                }
                
                // 다운로드 버튼들 표시
                const downloadBtn = document.getElementById('downloadBtn');
                if (downloadBtn) {
                    downloadBtn.classList.remove('hidden');
                }
                
                const downloadCombinedBtn = document.getElementById('downloadCombinedBtn');
                if (downloadCombinedBtn) {
                    downloadCombinedBtn.classList.remove('hidden');
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('계산 중 오류가 발생했습니다.', 'error');
        } finally {
            // 로딩 상태 해제
            if (calculateBtn && originalText) {
                calculateBtn.disabled = false;
                calculateBtn.innerHTML = originalText;
            }
        }
    }

    // 결과 표시
    displayResults(data) {
        const resultsDiv = document.getElementById('results');
        if (!resultsDiv) return;

        resultsDiv.innerHTML = `
            <div class="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                        </svg>
                    </div>
                    이상치 검출 결과
                </h2>
                
                <!-- 원본 데이터 정보 -->
                <div class="mb-8 p-6 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl border border-gray-200">
                    <h3 class="text-lg font-semibold mb-4 text-gray-700">원본 데이터 정보</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div class="text-center">
                            <div class="text-2xl font-bold text-blue-600">${data.original_count}</div>
                            <div class="text-sm text-gray-600">총 데이터 수</div>
                        </div>
                        <div class="text-center">
                            <div class="text-2xl font-bold text-green-600">${data.sample_name}</div>
                            <div class="text-sm text-gray-600">샘플명</div>
                        </div>
                        <div class="text-center">
                            <div class="text-2xl font-bold text-purple-600">${data.production_date}</div>
                            <div class="text-sm text-gray-600">생산일자</div>
                        </div>
                        <div class="text-center">
                            <div class="text-2xl font-bold text-orange-600">${data.pass_count}</div>
                            <div class="text-sm text-gray-600">패스</div>
                        </div>
                    </div>
                </div>

                <!-- 방법별 결과 -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    ${this.renderMethodResult('Z-Score', data.zscore, 'blue')}
                    ${this.renderMethodResult('IQR', data.iqr, 'green')}
                    ${this.renderMethodResult('MAD', data.mad, 'purple')}
                </div>

                <!-- 시각화 차트 -->
                <div class="bg-gray-50 rounded-xl p-6">
                    <h3 class="text-lg font-semibold mb-4">데이터 분포 시각화</h3>
                    <div id="scatter_plot"></div>
                </div>
            </div>
        `;

        // 차트 렌더링
        if (data.scatter_plot) {
            const chartData = JSON.parse(data.scatter_plot);
            Plotly.newPlot('scatter_plot', chartData.data, chartData.layout, {responsive: true});
        }

        // 결과 영역으로 스크롤
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }

    // 방법별 결과 렌더링
    renderMethodResult(methodName, methodData, color) {
        return `
            <div class="bg-white rounded-xl p-6 border border-${color}-200 shadow-sm">
                <h4 class="text-lg font-semibold mb-4 text-${color}-600">${methodName}</h4>
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="text-gray-600">임계값:</span>
                        <span class="font-medium">${methodData.threshold}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">처리된 데이터:</span>
                        <span class="font-medium text-${color}-600">${methodData.count}개</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">제거된 이상치:</span>
                        <span class="font-medium text-red-600">${methodData.outliers_count}개</span>
                    </div>
                    <hr class="border-gray-200">
                    <div class="flex justify-between">
                        <span class="text-gray-600">Size(nm) 평균:</span>
                        <span class="font-medium">${methodData.size_mean.toFixed(3)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">Size(nm) 표준편차:</span>
                        <span class="font-medium">${methodData.size_std.toFixed(3)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">PI 평균:</span>
                        <span class="font-medium">${methodData.pi_mean.toFixed(3)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-600">PI 표준편차:</span>
                        <span class="font-medium">${methodData.pi_std.toFixed(3)}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // CSV 다운로드
    downloadCSV() {
        if (!this.lastCalculationResult) {
            utils.showNotification('다운로드할 결과가 없습니다. 먼저 계산을 실행해주세요.', 'error');
            return;
        }

        window.location.href = '/download_csv';
    }

    // 결합된 데이터 다운로드 (원본 데이터 + 이상치 결과)
    downloadCombinedResults() {
        if (!this.lastCalculationResult) {
            utils.showNotification('다운로드할 결과가 없습니다. 먼저 계산을 실행해주세요.', 'error');
            return;
        }

        window.location.href = '/download_combined_results';
    }

    // 사용자 정의 데이터 상관관계 분석
    async showCustomDataCorrelation() {
        try {
            const result = await utils.apiRequest('/get_custom_data_correlation');
            
            if (result.status === 'error') {
                utils.showNotification(result.message, 'error');
                return;
            }
            
            this.displayCustomDataResults(result);
        } catch (error) {
            utils.showNotification('상관관계 분석 중 오류가 발생했습니다.', 'error');
        }
    }

    // 사용자 정의 데이터 결과 표시
    displayCustomDataResults(data) {
        const resultsDiv = document.getElementById('viscosity_results');
        const customFieldName = data.custom_field_name || '사용자 입력 필드(레퍼런스)';
        
        if (!resultsDiv) {
            // 결과 div가 없으면 생성
            const newResultsDiv = document.createElement('div');
            newResultsDiv.id = 'viscosity_results';
            newResultsDiv.className = 'mt-8';
            document.querySelector('#results').parentNode.appendChild(newResultsDiv);
        }
        
        document.getElementById('viscosity_results').innerHTML = `
            <div class="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
                <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                    <div class="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                        </svg>
                    </div>
                    ${customFieldName} 상관관계 분석 결과
                </h2>
                
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-orange-50 p-4 rounded-xl border border-orange-200">
                        <div class="text-2xl font-bold text-orange-600">${data.statistics.data_count}</div>
                        <div class="text-sm text-gray-600">${customFieldName} 데이터 수</div>
                    </div>
                    <div class="bg-red-50 p-4 rounded-xl border border-red-200">
                        <div class="text-2xl font-bold text-red-600">${data.statistics.correlation.toFixed(3)}</div>
                        <div class="text-sm text-gray-600">Size-${customFieldName} 상관계수</div>
                    </div>
                    <div class="bg-yellow-50 p-4 rounded-xl border border-yellow-200">
                        <div class="text-2xl font-bold text-yellow-600">${data.statistics.custom_mean.toFixed(1)}</div>
                        <div class="text-sm text-gray-600">평균 ${customFieldName}</div>
                    </div>
                    <div class="bg-green-50 p-4 rounded-xl border border-green-200">
                        <div class="text-2xl font-bold text-green-600">${data.statistics.size_mean.toFixed(1)}</div>
                        <div class="text-sm text-gray-600">평균 Size (nm)</div>
                    </div>
                </div>
                
                <div class="bg-gray-50 rounded-xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Size(nm) vs ${customFieldName} 상관관계</h3>
                    <div id="custom_correlation_chart"></div>
                </div>
            </div>
        `;
        
        // 차트 렌더링
        const chartData = JSON.parse(data.custom_correlation_chart);
        Plotly.newPlot('custom_correlation_chart', chartData.data, chartData.layout, {responsive: true});
        
        document.getElementById('viscosity_results').classList.remove('hidden');
        document.getElementById('viscosity_results').scrollIntoView({ behavior: 'smooth' });
    }
}

// 전역 인스턴스 생성
window.chartHandler = new ChartHandler();

// 전역 함수들 (기존 호환성 위해 유지)
window.calculateWithThresholds = () => chartHandler.calculateWithThresholds();
window.downloadCSV = () => chartHandler.downloadCSV();
window.downloadCombinedResults = () => chartHandler.downloadCombinedResults();
window.showCustomDataCorrelation = () => chartHandler.showCustomDataCorrelation();