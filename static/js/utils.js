/**
 * Utility Functions
 * 공통 유틸리티 함수들
 */

// 데이터 정리 함수
function cleanDataForJson(data) {
    const cleaned = {};
    for (const [key, values] of Object.entries(data)) {
        if (key === 'No.') {
            cleaned[key] = values;
        } else {
            cleaned[key] = values.map(v => 
                v === null || v === '' ? null : v
            );
        }
    }
    return cleaned;
}

// 숫자 값 검증 및 변환
function validateAndConvertNumber(value) {
    if (value === null || value === '' || 
        (typeof value === 'string' && value.trim() === '')) {
        return null;
    }
    try {
        const num = parseFloat(value);
        return isNaN(num) || !isFinite(num) ? null : num;
    } catch {
        return null;
    }
}

// 모달 관리
function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

// 사용자 정의 필드명 업데이트
function updateCustomFieldName() {
    const customFieldName = document.getElementById('custom_field_name').value;
    const customFieldHeader = document.getElementById('custom_field_header');
    const correlationBtnText = document.getElementById('correlation_analysis_btn_text');
    
    // 테이블 헤더 업데이트
    if (customFieldHeader) {
        customFieldHeader.textContent = customFieldName;
    }
    
    // 상관관계 분석 버튼 텍스트 업데이트
    if (correlationBtnText) {
        correlationBtnText.textContent = customFieldName + ' 상관관계 분석';
    }
}

// 알림 표시 (개선된 버전)
function showNotification(message, type = 'info') {
    // 기본 alert 대신 향후 개선된 알림 시스템 구현 가능
    alert(message);
}

// API 요청 헬퍼
async function apiRequest(url, data = null, method = 'GET') {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (data && method !== 'GET') {
        options.body = JSON.stringify(data);
    }
    
    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

// 로딩 상태 관리
function setLoadingState(elementId, isLoading) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (isLoading) {
        element.disabled = true;
        element.innerHTML = '<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>처리 중...';
    } else {
        element.disabled = false;
        element.innerHTML = element.getAttribute('data-original-text') || '계산';
    }
}

// 전역 변수 초기화
window.utils = {
    cleanDataForJson,
    validateAndConvertNumber,
    closeModal,
    showModal,
    updateCustomFieldName,
    showNotification,
    apiRequest,
    setLoadingState
};