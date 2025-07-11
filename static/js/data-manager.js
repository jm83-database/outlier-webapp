/**
 * Data Management Module
 * 데이터 입력, 업데이트, 파일 처리 관련 기능
 */

class DataManager {
    constructor() {
        this.currentData = {};
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // 기본 정보 입력 리스너
        const sampleNameEl = document.getElementById('sample_name');
        const productionDateEl = document.getElementById('production_date');
        const passCountEl = document.getElementById('pass_count');

        if (sampleNameEl) sampleNameEl.addEventListener('input', () => this.updateData());
        if (productionDateEl) productionDateEl.addEventListener('change', () => this.updateData());
        if (passCountEl) passCountEl.addEventListener('change', () => this.updateData());
    }

    // 데이터 업데이트
    async updateData() {
        const sampleName = document.getElementById('sample_name')?.value || '';
        const productionDate = document.getElementById('production_date')?.value || '';
        const passCount = document.getElementById('pass_count')?.value || 1;

        const tableData = this.getCurrentTableData();

        const requestData = {
            sample_name: sampleName,
            production_date: productionDate,
            pass_count: parseInt(passCount),
            table_data: tableData
        };

        try {
            const result = await utils.apiRequest('/update_data', requestData, 'POST');
            if (result.status !== 'success') {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('데이터 업데이트 중 오류가 발생했습니다.', 'error');
        }
    }

    // 현재 테이블 데이터 가져오기
    getCurrentTableData() {
        const tableData = { 'No.': [], 'Size(nm)': [], 'PI': [] };
        const tbody = document.querySelector('#dataTable tbody');
        
        if (!tbody) return tableData;

        const rows = tbody.querySelectorAll('tr');
        
        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td');
            tableData['No.'].push(index + 1);
            
            // size(nm) 값
            const sizeInput = cells[1]?.querySelector('input');
            const sizeValue = utils.validateAndConvertNumber(sizeInput?.value);
            tableData['Size(nm)'].push(sizeValue);
            
            // PI 값
            const piInput = cells[2]?.querySelector('input');
            const piValue = utils.validateAndConvertNumber(piInput?.value);
            tableData['PI'].push(piValue);
            
            // 추가 컬럼들 처리
            for (let i = 3; i < cells.length - 1; i++) {
                const input = cells[i]?.querySelector('input');
                if (input) {
                    const columnName = input.getAttribute('data-column');
                    if (columnName && !tableData[columnName]) {
                        tableData[columnName] = new Array(index).fill(null);
                    }
                    if (columnName) {
                        const value = utils.validateAndConvertNumber(input.value);
                        tableData[columnName].push(value);
                    }
                }
            }
        });

        return tableData;
    }

    // 행 추가
    async addRow() {
        try {
            const result = await utils.apiRequest('/add_row', {}, 'POST');
            if (result.status === 'success') {
                this.renderTable(result.table_data);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('행 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 컬럼 추가
    async addColumn() {
        const columnName = prompt('새 컬럼의 이름을 입력하세요:');
        if (!columnName || columnName.trim() === '') {
            return;
        }

        try {
            const result = await utils.apiRequest('/add_column', { column_name: columnName.trim() }, 'POST');
            if (result.status === 'success') {
                this.renderTable(result.table_data);
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('컬럼 추가 중 오류가 발생했습니다.', 'error');
        }
    }

    // 데이터 초기화
    async resetData() {
        if (!confirm('모든 데이터를 초기화하시겠습니까?')) {
            return;
        }

        try {
            const result = await utils.apiRequest('/reset_data', {}, 'POST');
            if (result.status === 'success') {
                document.getElementById('sample_name').value = result.sample_name;
                document.getElementById('production_date').value = result.production_date;
                document.getElementById('pass_count').value = result.pass_count;
                this.renderTable(result.table_data);
                
                // 결과 영역 숨기기
                const resultsDiv = document.getElementById('results');
                if (resultsDiv) {
                    resultsDiv.innerHTML = '';
                }
                
                // 계산 결과 추가 버튼 숨기기
                const addFromResultBtn = document.getElementById('addFromResultBtn');
                if (addFromResultBtn) {
                    addFromResultBtn.classList.add('hidden');
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('데이터 초기화 중 오류가 발생했습니다.', 'error');
        }
    }

    // 테이블 렌더링
    renderTable(tableData) {
        const tbody = document.querySelector('#dataTable tbody');
        const thead = document.querySelector('#dataTable thead tr');
        
        if (!tbody || !thead) return;

        // 헤더 업데이트 (순서 고정: No., Size(nm), PI, 기타 컬럼들)
        thead.innerHTML = '<th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">No.</th>';
        
        // 고정 순서 컬럼들
        const fixedColumns = ['Size(nm)', 'PI'];
        const allColumns = Object.keys(tableData).filter(key => key !== 'No.');
        
        // 컬럼 이름 매핑 (대소문자 무시)
        const columnMap = {};
        allColumns.forEach(col => {
            columnMap[col.toLowerCase()] = col;
        });

        // 먼저 고정 순서 컬럼들 추가
        fixedColumns.forEach(column => {
            const realCol = columnMap[column.toLowerCase()];
            if (realCol) {
                // 항상 "Size(nm)"로 표기
                const displayName = realCol.toLowerCase() === 'size(nm)' || realCol.toLowerCase() === 'size(nm)' ? 'Size(nm)' : realCol;
                thead.innerHTML += `<th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">${displayName}</th>`;
            }
        });

        // 그 다음 나머지 컬럼들 추가
        allColumns
            .filter(column => !fixedColumns.map(c => c.toLowerCase()).includes(column.toLowerCase()))
            .forEach(column => {
                // 항상 "Size(nm)"로 표기
                const displayName = column.toLowerCase() === 'size(nm)' || column.toLowerCase() === 'size(nm)' ? 'Size(nm)' : column;
                thead.innerHTML += `<th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">${displayName}</th>`;
            });
        
        thead.innerHTML += '<th class="px-4 py-2 text-center font-medium text-gray-700 bg-gray-100">작업</th>';

        // 본문 업데이트
        tbody.innerHTML = '';
        const rowCount = tableData['No.']?.length || 0;

        for (let i = 0; i < rowCount; i++) {
            const row = tbody.insertRow();
            row.className = 'border-b hover:bg-gray-50';
            
            // No. 컬럼
            const noCell = row.insertCell();
            noCell.className = 'px-4 py-2 text-center font-medium';
            noCell.textContent = i + 1;
            
            // 데이터 컬럼들 (고정 순서 적용)
            const orderedColumns = [];
            fixedColumns.forEach(column => {
                if (allColumns.includes(column)) {
                    orderedColumns.push(column);
                }
            });
            allColumns.filter(column => !fixedColumns.includes(column)).forEach(column => {
                orderedColumns.push(column);
            });
            
            orderedColumns.forEach(column => {
                const cell = row.insertCell();
                cell.className = 'px-4 py-2';
                
                const input = document.createElement('input');
                input.type = 'number';
                input.step = '0.001';
                input.className = 'w-full px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-center';
                input.setAttribute('data-column', column);
                
                const value = tableData[column]?.[i];
                if (value !== null && value !== undefined) {
                    input.value = value;
                }
                
                input.addEventListener('change', () => this.updateData());
                cell.appendChild(input);
            });
            
            // 작업 컬럼 (삭제 버튼)
            const actionCell = row.insertCell();
            actionCell.className = 'px-4 py-2 text-center';
            actionCell.innerHTML = `
                <button onclick="dataManager.deleteRow(${i})" 
                        class="text-red-600 hover:text-red-800 font-medium">
                    삭제
                </button>
            `;
        }
    }

    // 행 삭제
    deleteRow(index) {
        if (!confirm('이 행을 삭제하시겠습니까?')) {
            return;
        }
        
        const tbody = document.querySelector('#dataTable tbody');
        if (tbody && tbody.rows[index]) {
            tbody.deleteRow(index);
            this.updateData();
        }
    }

    // 파일 업로드
    async uploadFile(fileInput) {
        const file = fileInput.files[0];
        if (!file) {
            utils.showNotification('파일을 선택해주세요.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload_file', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                this.renderTable(result.table_data);
                utils.showNotification(result.message, 'success');
                
                if (result.columns_mapped) {
                    let mappingInfo = '컬럼 매핑 결과:\n';
                    for (const [key, value] of Object.entries(result.columns_mapped)) {
                        if (value) {
                            mappingInfo += `${key}: ${value}\n`;
                        }
                    }
                    utils.showNotification(mappingInfo, 'info');
                }
            } else {
                utils.showNotification(result.message, 'error');
            }
        } catch (error) {
            utils.showNotification('파일 업로드 중 오류가 발생했습니다.', 'error');
        }
        
        // 파일 입력 초기화
        fileInput.value = '';
    }
}

// 전역 인스턴스 생성
window.dataManager = new DataManager();