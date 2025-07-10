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
    savedDatasets: []
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
    const datasetName = prompt('데이터셋 이름을 입력하세요:');
    if (!datasetName || datasetName.trim() === '') {
        return;
    }

    try {
        const result = await utils.apiRequest('/save_dataset', { dataset_name: datasetName.trim() }, 'POST');
        
        if (result.status === 'success') {
            utils.showNotification(result.message, 'success');
            updateSavedDatasetsList();
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
            // UI 업데이트
            document.getElementById('sample_name').value = result.sample_name;
            document.getElementById('production_date').value = result.production_date;
            document.getElementById('pass_count').value = result.pass_count;
            
            dataManager.renderTable(result.table_data);
            utils.showNotification('데이터셋이 성공적으로 불러와졌습니다.', 'success');
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 불러오기 중 오류가 발생했습니다.', 'error');
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
    
    // 기존 옵션 제거 (첫 번째 옵션 제외)
    selectElement.innerHTML = '<option value="">저장된 데이터셋 선택</option>';
    
    // 새로운 옵션 추가
    datasets.forEach(dataset => {
        const option = document.createElement('option');
        option.value = dataset;
        option.textContent = dataset;
        selectElement.appendChild(option);
    });
    
    // 개수 업데이트
    if (countElement) {
        countElement.textContent = datasets.length;
    }
}

async function deleteDataset() {
    const selectElement = document.getElementById('saved_datasets');
    const datasetName = selectElement.value;
    
    if (!datasetName) {
        utils.showNotification('삭제할 데이터셋을 선택해주세요.', 'info');
        return;
    }
    
    if (!confirm(`데이터셋 "${datasetName}"을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const result = await utils.apiRequest('/delete_dataset', { dataset_name: datasetName }, 'POST');
        
        if (result.status === 'success') {
            await updateSavedDatasetsList();
            utils.showNotification('데이터셋이 성공적으로 삭제되었습니다.', 'success');
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 삭제 중 오류가 발생했습니다.', 'error');
    }
}

async function showDatasetComparison() {
    const datasets = await getSavedDatasets();
    
    if (datasets.length < 2) {
        utils.showNotification('비교하려면 최소 2개의 데이터셋이 필요합니다.', 'info');
        return;
    }
    
    try {
        const result = await utils.apiRequest('/compare_datasets', {}, 'POST');
        
        if (result.status === 'success') {
            displayComparisonResults(result.comparison_data);
            utils.showNotification('데이터셋 비교가 완료되었습니다.', 'success');
        } else {
            utils.showNotification(result.message, 'error');
        }
    } catch (error) {
        utils.showNotification('데이터셋 비교 중 오류가 발생했습니다.', 'error');
    }
}

function displayComparisonResults(comparisonData) {
    const resultsDiv = document.getElementById('comparison_results');
    resultsDiv.innerHTML = comparisonData.html;
    resultsDiv.classList.remove('hidden');
    
    // 스크롤하여 결과 보기
    resultsDiv.scrollIntoView({ behavior: 'smooth' });
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
    const customFieldHeader = document.getElementById('custom_field_header');
    const correlationAnalysisBtn = document.getElementById('correlation_analysis_btn_text');
    
    if (customFieldNameInput && customFieldHeader) {
        customFieldHeader.textContent = customFieldNameInput.value;
    }
    
    if (customFieldNameInput && correlationAnalysisBtn) {
        correlationAnalysisBtn.textContent = `${customFieldNameInput.value} 상관관계 분석`;
    }
}

// 도움말 모달
function showHelpModal() {
    utils.showModal('helpModal');
}

// 전역 함수 등록 (기존 호환성)
window.saveDataset = saveDataset;
window.loadDataset = loadDataset;
window.showHelpModal = showHelpModal;
window.showCustomDataCorrelation = showCustomDataCorrelation;
window.updateCustomFieldName = updateCustomFieldName;

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