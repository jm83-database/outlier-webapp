/**
 * Main Application JavaScript
 * 애플리케이션 초기화 및 핵심 기능
 */

// 전역 상태 관리
window.appState = {
    isInitialized: false,
    currentThresholds: {
        zscore: 3.0,
        iqr: 1.5,
        mad: 3.5
    },
    savedDatasets: [],
    darkMode: false
};

// 애플리케이션 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeApplication();
});

async function initializeApplication() {
    console.log('🚀 Outlier Management System 초기화 시작...');
    
    try {
        // 1. 기본 UI 요소 초기화
        initializeUI();
        
        // 2. 이벤트 리스너 설정
        setupEventListeners();
        
        // 3. 임계값 슬라이더 초기화
        initializeThresholdSliders();
        
        // 4. 세션 데이터 복원
        restoreSessionData();
        
        // 5. 테이블 초기화
        initializeDataTable();
        
        // 6. 데이터셋 목록 로드
        await updateSavedDatasetsList();
        
        // 7. 다크모드 상태 복원
        initializeDarkMode();
        
        window.appState.isInitialized = true;
        console.log('✅ 애플리케이션 초기화 완료');
        
    } catch (error) {
        console.error('❌ 애플리케이션 초기화 실패:', error);
        utils.showNotification('애플리케이션 초기화 중 오류가 발생했습니다.', 'error');
    }
}

// UI 초기화
function initializeUI() {
    // 다운로드 버튼 초기 상태
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.classList.add('hidden');
    }
    
    // 결합된 다운로드 버튼 초기 상태
    const downloadCombinedBtn = document.getElementById('downloadCombinedBtn');
    if (downloadCombinedBtn) {
        downloadCombinedBtn.classList.add('hidden');
    }
    
    // 계산 결과 추가 버튼 초기 상태
    const addFromResultBtn = document.getElementById('addFromResultBtn');
    if (addFromResultBtn) {
        addFromResultBtn.classList.add('hidden');
    }
    
    // 결과 영역 초기화
    const resultsDiv = document.getElementById('results');
    if (resultsDiv) {
        resultsDiv.innerHTML = '';
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 모달 외부 클릭 시 닫기
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('fixed')) {
            e.target.classList.add('hidden');
        }
    });
    
    // 파일 업로드
    const fileInput = document.getElementById('file_input');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                dataManager.uploadFile(this);
            }
        });
    }
    
    // 두 그룹 동시 추가 버튼
    const addBothGroupsBtn = document.getElementById('addBothGroupsBtn');
    if (addBothGroupsBtn) {
        addBothGroupsBtn.addEventListener('click', function() {
            if (window.passManager && window.passManager.addBothGroupsAverage) {
                window.passManager.addBothGroupsAverage();
            } else {
                console.error('PassManager가 아직 초기화되지 않았습니다.');
                setTimeout(() => {
                    if (window.passManager && window.passManager.addBothGroupsAverage) {
                        window.passManager.addBothGroupsAverage();
                    }
                }, 100);
            }
        });
    }
    
    // 키보드 단축키
    document.addEventListener('keydown', function(e) {
        // Ctrl + Enter로 계산 실행
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            chartHandler.calculateWithThresholds();
        }
        
        // Esc로 모달 닫기
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.fixed:not(.hidden)');
            modals.forEach(modal => modal.classList.add('hidden'));
        }
    });
}

// 임계값 슬라이더 초기화
function initializeThresholdSliders() {
    const sliders = [
        { id: 'zscore_threshold', value: 3.0, min: 1.0, max: 5.0, step: 0.1 },
        { id: 'iqr_threshold', value: 1.5, min: 0.5, max: 3.0, step: 0.1 },
        { id: 'mad_threshold', value: 3.5, min: 1.0, max: 5.0, step: 0.1 }
    ];
    
    sliders.forEach(slider => {
        const element = document.getElementById(slider.id);
        if (element) {
            element.value = slider.value;
            element.min = slider.min;
            element.max = slider.max;
            element.step = slider.step;
            
            // 실시간 값 업데이트
            const valueDisplay = document.getElementById(slider.id + '_value');
            if (valueDisplay) {
                valueDisplay.textContent = slider.value;
                
                element.addEventListener('input', function() {
                    valueDisplay.textContent = this.value;
                    window.appState.currentThresholds[slider.id.replace('_threshold', '')] = parseFloat(this.value);
                });
            }
        }
    });
}

// 세션 데이터 복원
function restoreSessionData() {
    try {
        // 서버에서 전달된 세션 데이터 복원
        const currentDataset = window.sessionData || {};
        
        if (currentDataset.pass_averages) {
            passManager.renderPassAveragesTable(currentDataset.pass_averages);
        }
        
        if (currentDataset.table_data) {
            dataManager.renderTable(currentDataset.table_data);
        }
        
        console.log('✅ 세션 데이터 복원 완료');
    } catch (error) {
        console.warn('⚠️ 세션 데이터 복원 실패:', error);
    }
}

// 데이터 테이블 초기화
function initializeDataTable() {
    const dataTable = document.getElementById('dataTable');
    if (!dataTable) {
        console.warn('⚠️ 데이터 테이블을 찾을 수 없습니다.');
        return;
    }
    
    // 기본 테이블 구조가 없으면 생성
    if (!dataTable.querySelector('thead')) {
        dataTable.innerHTML = `
            <thead>
                <tr>
                    <th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">No.</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">Size(nm)</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">PI</th>
                    <th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">작업</th>
                </tr>
            </thead>
            <tbody>
                <!-- 데이터 행들이 여기에 추가됩니다 -->
            </tbody>
        `;
    }
}

// 데이터셋 관리 함수들
async function saveDataset() {
    const datasetNameInput = document.getElementById('dataset_name');
    const datasetName = datasetNameInput.value.trim();
    
    if (!datasetName) {
        utils.showNotification('데이터셋 이름을 입력해주세요.', 'error');
        datasetNameInput.focus();
        return;
    }

    try {
        const result = await utils.apiRequest('/save_dataset', { dataset_name: datasetName }, 'POST');
        
        if (result.status === 'success') {
            utils.showNotification(result.message, 'success');
            datasetNameInput.value = ''; // 입력 필드 초기화
            await updateSavedDatasetsList();
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 저장 중 오류가 발생했습니다.', 'error');
    }
}

async function loadDataset() {
    const selectElement = document.getElementById('saved_datasets');
    const datasetName = selectElement.value;
    
    if (!datasetName) {
        utils.showNotification('불러올 데이터셋을 선택해주세요.', 'info');
        return;
    }

    try {
        const result = await utils.apiRequest('/load_dataset', { dataset_name: datasetName }, 'POST');
        
        if (result.status === 'success') {
            console.log('데이터셋 로드 결과:', result);
            
            // UI 업데이트
            const sampleNameEl = document.getElementById('sample_name');
            const productionDateEl = document.getElementById('production_date');
            const passCountEl = document.getElementById('pass_count');
            
            if (sampleNameEl) {
                console.log('샘플명 업데이트 시도:', result.sample_name);
                sampleNameEl.value = result.sample_name || '';
                console.log('샘플명 입력 필드 값:', sampleNameEl.value);
            }
            if (productionDateEl) {
                productionDateEl.value = result.production_date || '';
            }
            if (passCountEl) {
                passCountEl.value = result.pass_count || 1;
            }
            
            // 사용자 정의 필드명 업데이트
            if (result.custom_data_field_name) {
                const customFieldNameEl = document.getElementById('custom_field_name');
                if (customFieldNameEl) {
                    customFieldNameEl.value = result.custom_data_field_name;
                    // PassManager에서 라벨 업데이트
                    if (window.passManager) {
                        window.passManager.updateCustomFieldLabels(result.custom_data_field_name);
                    }
                }
            }
            
            dataManager.renderTable(result.table_data);
            
            // UI 업데이트 완료 후 입력 이벤트 트리거하여 데이터 동기화
            setTimeout(() => {
                if (sampleNameEl) {
                    sampleNameEl.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, 100);
            
            utils.showNotification('데이터셋이 성공적으로 불러와졌습니다.', 'success');
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 불러오기 중 오류가 발생했습니다.', 'error');
    }
}

async function deleteDataset() {
    const selectElement = document.getElementById('saved_datasets');
    const datasetName = selectElement.value;
    
    if (!datasetName) {
        utils.showNotification('삭제할 데이터셋을 선택해주세요.', 'info');
        return;
    }

    if (!confirm(`"${datasetName}" 데이터셋을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const result = await utils.apiRequest('/delete_dataset', { dataset_name: datasetName }, 'POST');
        
        if (result.status === 'success') {
            utils.showNotification(result.message, 'success');
            updateSavedDatasetsList();
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 삭제 중 오류가 발생했습니다.', 'error');
    }
}

async function getSavedDatasets() {
    try {
        const result = await utils.apiRequest('/get_saved_datasets', {}, 'GET');
        return result.datasets || [];
    } catch (error) {
        console.error('저장된 데이터셋 목록 가져오기 실패:', error);
        return [];
    }
}

async function updateSavedDatasetsList() {
    const datasets = await getSavedDatasets();
    const selectElement = document.getElementById('saved_datasets');
    const countElement = document.getElementById('dataset_count');
    
    if (!selectElement) {
        console.error('saved_datasets 엘리먼트를 찾을 수 없습니다');
        return;
    }
    
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    selectElement.innerHTML = '<option value="">저장된 데이터셋 선택</option>';
    
    // 새로운 옵션 추가
    datasets.forEach(dataset => {
        const option = document.createElement('option');
        option.value = dataset.name || dataset;
        option.textContent = dataset.name || dataset;
        selectElement.appendChild(option);
    });
    
    // 개수 업데이트
    if (countElement) {
        countElement.textContent = datasets.length;
    }
}


async function showDatasetComparison() {
    // 이전 비교 결과 숨기기
    const comparisonDiv = document.getElementById('comparison_results');
    if (comparisonDiv) {
        comparisonDiv.classList.add('hidden');
    }
    
    const datasets = await getSavedDatasets();
    
    if (datasets.length < 2) {
        utils.showNotification('비교하려면 최소 2개의 데이터셋이 필요합니다.', 'info');
        return;
    }
    
    // 데이터셋 선택 모달 표시
    const selectedDatasets = await showDatasetSelectionModal(datasets);
    
    if (!selectedDatasets || selectedDatasets.length < 2) {
        utils.showNotification('비교하려면 최소 2개의 데이터셋을 선택해주세요.', 'info');
        return;
    }
    
    try {
        const result = await utils.apiRequest('/compare_datasets', { dataset_names: selectedDatasets }, 'POST');
        
        if (result.status === 'success') {
            displayComparisonResults(result);
            utils.showNotification('데이터셋 비교가 완료되었습니다.', 'success');
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 비교 중 오류가 발생했습니다.', 'error');
    }
}

async function showDatasetSelectionModal(datasets) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <h3 class="text-lg font-semibold mb-4">비교할 데이터셋 선택</h3>
                <div class="space-y-2 mb-4" id="dataset-checkboxes">
                    ${datasets.map(dataset => `
                        <label class="flex items-center space-x-2">
                            <input type="checkbox" value="${dataset.name}" class="dataset-checkbox">
                            <span class="text-sm">${dataset.name} (${dataset.data_count}개 데이터)</span>
                        </label>
                    `).join('')}
                </div>
                <div class="flex justify-end space-x-2">
                    <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
                        취소
                    </button>
                    <button onclick="window.confirmDatasetSelection()" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                        비교하기
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        window.confirmDatasetSelection = () => {
            const checkboxes = modal.querySelectorAll('.dataset-checkbox:checked');
            const selectedDatasets = Array.from(checkboxes).map(cb => cb.value);
            modal.remove();
            resolve(selectedDatasets);
        };
        
        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve([]);
            }
        });
    });
}

function displayComparisonResults(result) {
    const targetDiv = document.getElementById('comparison_results');
    if (!targetDiv) {
        console.error('comparison_results 엘리먼트를 찾을 수 없습니다.');
        return;
    }
    
    // 비교 결과 HTML 생성
    let html = `
        <div class="comparison-results">
            <h3 class="text-xl font-bold mb-4">📊 데이터셋 비교 결과</h3>
            <div class="mb-6">
                <div id="comparison_chart" style="width: 100%; height: 400px;"></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    `;
    
    // 통계 요약 표시
    if (result.stats_summary) {
        Object.entries(result.stats_summary).forEach(([datasetName, stats]) => {
            html += `
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-semibold mb-2">${datasetName}</h4>
                    <div class="space-y-1 text-sm">
                        <div>데이터 수: ${stats.count}개</div>
                        <div>Size(nm) 평균: ${stats.size_mean.toFixed(3)}</div>
                        <div>Size(nm) 표준편차: ${stats.size_std.toFixed(3)}</div>
                        <div>PI 평균: ${stats.pi_mean.toFixed(3)}</div>
                        <div>PI 표준편차: ${stats.pi_std.toFixed(3)}</div>
                    </div>
                </div>
            `;
        });
    }
    
    html += `
            </div>
        </div>
    `;
    
    targetDiv.innerHTML = html;
    targetDiv.classList.remove('hidden');
    
    // 차트 렌더링
    if (result.comparison_plot) {
        const plotData = JSON.parse(result.comparison_plot);
        Plotly.newPlot('comparison_chart', plotData.data, plotData.layout, {responsive: true});
    }
    
    // 스크롤하여 결과 보기
    targetDiv.scrollIntoView({ behavior: 'smooth' });
}

// 사용자 정의 데이터 상관관계 분석
async function showCustomDataCorrelation() {
    try {
        const result = await utils.apiRequest('/get_custom_data_correlation', {}, 'GET');
        
        if (result.status === 'error') {
            utils.showNotification(result.message, 'error');
            return;
        }
        
        displayCustomDataCorrelation(result);
    } catch (error) {
        utils.showNotification('상관관계 분석 중 오류가 발생했습니다.', 'error');
    }
}

// 사용자 정의 데이터 상관관계 결과 표시
function displayCustomDataCorrelation(data) {
    // 기존 결과 div 찾기 또는 생성
    let correlationDiv = document.getElementById('custom_correlation_results');
    if (!correlationDiv) {
        correlationDiv = document.createElement('div');
        correlationDiv.id = 'custom_correlation_results';
        correlationDiv.className = 'mt-8';
        
        // 트렌드 결과 섹션 다음에 추가
        const trendDiv = document.getElementById('trend_results');
        if (trendDiv) {
            trendDiv.parentNode.insertBefore(correlationDiv, trendDiv.nextSibling);
        } else {
            document.body.appendChild(correlationDiv);
        }
    }
    
    const experimentalCount = data.statistics.experimental_count || 0;
    const controlCount = data.statistics.control_count || 0;
    const totalCount = data.statistics.total_count || 0;
    
    correlationDiv.innerHTML = `
        <div class="glass-card rounded-2xl shadow-xl p-8 border border-white/20">
            <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-3">
                <div class="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                    <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                    </svg>
                </div>
                ${data.custom_field_name} vs Size(nm) 상관관계 분석
            </h2>
            
            <!-- 통계 요약 -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <div class="text-2xl font-bold text-blue-600">${experimentalCount}</div>
                    <div class="text-sm text-gray-600">실험군 데이터</div>
                </div>
                <div class="bg-green-50 p-4 rounded-xl border border-green-200">
                    <div class="text-2xl font-bold text-green-600">${controlCount}</div>
                    <div class="text-sm text-gray-600">대조군 데이터</div>
                </div>
                <div class="bg-purple-50 p-4 rounded-xl border border-purple-200">
                    <div class="text-2xl font-bold text-purple-600">${totalCount}</div>
                    <div class="text-sm text-gray-600">총 데이터 수</div>
                </div>
                <div class="bg-orange-50 p-4 rounded-xl border border-orange-200">
                    <div class="text-2xl font-bold text-orange-600">${data.statistics.correlation.toFixed(3)}</div>
                    <div class="text-sm text-gray-600">상관계수</div>
                </div>
            </div>

            <!-- 차트 -->
            <div class="bg-gray-50 rounded-xl p-6">
                <div id="custom_correlation_chart"></div>
            </div>
            
            <!-- 데이터 요약 -->
            <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="bg-blue-50 p-4 rounded-xl">
                    <h3 class="font-semibold text-blue-800 mb-2">실험군 데이터 (${experimentalCount}개)</h3>
                    <div class="text-sm text-gray-600">파란색 점으로 표시됨</div>
                </div>
                <div class="bg-green-50 p-4 rounded-xl">
                    <h3 class="font-semibold text-green-800 mb-2">대조군 데이터 (${controlCount}개)</h3>
                    <div class="text-sm text-gray-600">초록색 점으로 표시됨</div>
                </div>
            </div>
        </div>
    `;

    // 차트 렌더링
    if (data.custom_correlation_chart) {
        const chartData = JSON.parse(data.custom_correlation_chart);
        Plotly.newPlot('custom_correlation_chart', chartData.data, chartData.layout, {responsive: true});
    }

    correlationDiv.scrollIntoView({ behavior: 'smooth' });
}

// 사용자 정의 필드명 업데이트
function updateCustomFieldName() {
    const customFieldNameInput = document.getElementById('custom_field_name');
    
    if (customFieldNameInput && window.passManager) {
        // PassManager에서 모든 라벨 업데이트를 처리
        window.passManager.updateCustomFieldLabels(customFieldNameInput.value);
    }
}

// 도움말 모달
function showHelpModal() {
    utils.showModal('helpModal');
}

// 페이지 새로고침 함수
function refreshPage() {
    // 로딩 표시
    const refreshBtn = event.target.closest('button');
    const originalHTML = refreshBtn.innerHTML;
    
    refreshBtn.innerHTML = `
        <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        새로고침 중...
    `;
    refreshBtn.disabled = true;
    
    // 강제 새로고침 (캐시 무시)
    setTimeout(() => {
        location.reload(true);
    }, 500);
}

// 다크모드 관련 함수들
function initializeDarkMode() {
    // 로컬 스토리지에서 다크모드 상태 복원
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        enableDarkMode();
    }
}

function toggleDarkMode() {
    if (window.appState.darkMode) {
        disableDarkMode();
    } else {
        enableDarkMode();
    }
}

function enableDarkMode() {
    document.body.classList.add('dark-mode');
    const toggleBtn = document.querySelector('.dark-mode-toggle');
    if (toggleBtn) {
        toggleBtn.classList.add('dark');
    }
    
    window.appState.darkMode = true;
    localStorage.setItem('darkMode', 'true');
    console.log('🌙 다크모드 활성화');
}

function disableDarkMode() {
    document.body.classList.remove('dark-mode');
    const toggleBtn = document.querySelector('.dark-mode-toggle');
    if (toggleBtn) {
        toggleBtn.classList.remove('dark');
    }
    
    window.appState.darkMode = false;
    localStorage.setItem('darkMode', 'false');
    console.log('☀️ 라이트모드 활성화');
}

// 전역 함수 등록 (기존 호환성)
window.saveDataset = saveDataset;
window.loadDataset = loadDataset;
window.deleteDataset = deleteDataset;
window.showDatasetComparison = showDatasetComparison;
window.showHelpModal = showHelpModal;
window.refreshPage = refreshPage;
window.showCustomDataCorrelation = showCustomDataCorrelation;
window.updateCustomFieldName = updateCustomFieldName;
window.toggleDarkMode = toggleDarkMode;

// PassManager 함수들도 전역으로 등록
window.addBothGroupsAverage = function() {
    if (window.passManager) {
        return window.passManager.addBothGroupsAverage();
    } else {
        console.error('PassManager가 아직 초기화되지 않았습니다.');
    }
};
window.addPassAverage = function() {
    if (window.passManager) {
        return window.passManager.addPassAverage();
    }
};
window.addFromCurrentResult = function() {
    if (window.passManager) {
        return window.passManager.addFromCurrentResult();
    }
};
window.clearAllPasses = function() {
    if (window.passManager) {
        return window.passManager.clearAllPasses();
    }
};
window.showTrendAnalysis = function() {
    if (window.passManager) {
        return window.passManager.showTrendAnalysis();
    }
};

// 개발 모드에서 디버깅 정보
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.debug = {
        appState: window.appState,
        dataManager: window.dataManager,
        chartHandler: window.chartHandler,
        passManager: window.passManager,
        utils: window.utils
    };
    console.log('🔧 개발 모드: window.debug에서 디버깅 정보 확인 가능');
}

console.log('📄 main.js 로드 완료');