# Excel 365 计算执行器（COM）
# 用法：powershell -NoProfile -File src/excel/run.ps1 [-Cases <cases.json>] [-Out <excel-results.json>]
param(
    [string]$Cases = 'cases/public/starter.json',
    [string]$Out = 'oracle/excel-results.json',
    [string]$Workbook = 'oracle/excel-oracle-workbook.xlsx'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root

$ErrorList = @('#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A',
    '#GETTING_DATA', '#SPILL!', '#CALC!', '#FIELD!', '#BLOCKED!', '#CONNECT!', '#BUSY!', '#UNKNOWN!')

function Get-CellValue {
    param($Cell)
    $v = $null
    $text = ''
    try { $v = $Cell.Value2 } catch { $v = $null }
    try { $text = [string]$Cell.Text } catch { $text = '' }
    if ($null -eq $v) {
        return [ordered]@{ type = 'empty' }
    }
    # Excel 错误值在 COM 中表现为 Int32；正常数值是 Double，文本是 String，布尔是 Boolean
    if ($v -is [int] -or $v -is [int64] -or $v -is [int16]) {
        $code = $text
        if ([string]::IsNullOrEmpty($code)) { $code = '#VALUE!' }
        return [ordered]@{ type = 'error'; value = $code.ToUpper() }
    }
    if ($v -is [bool]) {
        return [ordered]@{ type = 'bool'; value = [bool]$v }
    }
    if ($v -is [double] -or $v -is [single] -or $v -is [decimal] -or $v -is [long]) {
        $d = [double]$v
        if ([double]::IsNaN($d) -or [double]::IsInfinity($d)) {
            return [ordered]@{ type = 'error'; value = '#NUM!' }
        }
        return [ordered]@{ type = 'number'; value = $d }
    }
    $s = [string]$v
    return [ordered]@{ type = 'text'; value = $s }
}

function Get-RangeMatrix {
    param($Worksheet, [string]$RangeRef)
    $rng = $Worksheet.Range($RangeRef)
    $rows = [int]$rng.Rows.Count
    $cols = [int]$rng.Columns.Count
    # 用“行数组的数组”输出，保证 JSON 中始终是二维矩阵（ConvertTo-Json 会把 N×1 的 object[,] 拍平）
    $matrixRows = New-Object System.Collections.ArrayList
    for ($i = 1; $i -le $rows; $i++) {
        $rowValues = New-Object 'object[]' $cols
        for ($j = 1; $j -le $cols; $j++) {
            $cj = $j - 1
            $cell = $rng.Cells.Item($i, $j)
            $rowValues[$cj] = Get-CellValue -Cell $cell
        }
        [void]$matrixRows.Add($rowValues)
    }
    return , $matrixRows
}

function Write-Log {
    param([string]$Message)
    $line = '[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss.fff'), $Message
    Add-Content -Path $script:LogPath -Value $line -Encoding utf8
    Write-Host $line
}

$casesPath = if ([System.IO.Path]::IsPathRooted($Cases)) { $Cases } else { Join-Path $root $Cases }
$outPath = if ([System.IO.Path]::IsPathRooted($Out)) { $Out } else { Join-Path $root $Out }
$workbookPath = if ([System.IO.Path]::IsPathRooted($Workbook)) { $Workbook } else { Join-Path $root $Workbook }
New-Item -ItemType Directory -Force (Split-Path -Parent $outPath) | Out-Null
New-Item -ItemType Directory -Force (Join-Path $root 'out') | Out-Null
New-Item -ItemType Directory -Force (Split-Path -Parent $workbookPath) | Out-Null
$script:LogPath = Join-Path $root 'out\excel-run.log'
Remove-Item $script:LogPath -ErrorAction SilentlyContinue

$casesDoc = Get-Content -Path $casesPath -Raw -Encoding utf8 | ConvertFrom-Json
$caseList = @($casesDoc.cases)
$caseCount = @($caseList).Count
Write-Log ("Excel 执行器启动，用例文件 {0}，用例数 {1}" -f $casesPath, $caseCount)

$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
$xl.ScreenUpdating = $false
$xl.EnableEvents = $false
# Calculation 需在创建文档后再设置（见下）
$wb = $null
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$sw = [System.Diagnostics.Stopwatch]::StartNew()

try {
    $wb = $xl.Workbooks.Add()
    $wb.Date1904 = $false
    try { $xl.Calculation = -4105 } catch { Write-Log ("设置计算模式失败: {0}" -f $_.Exception.Message) }   # xlCalculationAutomatic
    $meta = [ordered]@{
        excelVersion  = [string]$xl.Version
        excelBuild    = [string]$xl.Build
        operatingSystem = [string]$xl.OperatingSystem
        date1904      = [bool]$wb.Date1904
        calculation   = [int]$xl.Calculation
        culture       = [System.Globalization.CultureInfo]::CurrentCulture.Name
        workbookSheets = 0
        dynamicArraySpill = 'readRange cases use CSE array formulas; native spill behavior is not tested'
    }
    Write-Log ("Excel 版本 {0} Build {1}，日期系统 1900，自动重算" -f $meta.excelVersion, $meta.excelBuild)

    # 说明页 + 自检
    $infoSheet = $wb.Worksheets.Item(1)
    $infoSheet.Name = '说明'
    $infoSheet.Range('A1').Value2 = 'Excel 公式计算执行器'
    $infoSheet.Range('A2').Value2 = '版本/Build'
    $infoSheet.Range('B2').Value2 = "$($meta.excelVersion) / $($meta.excelBuild)"
    $infoSheet.Range('A3').Value2 = '日期系统'
    $infoSheet.Range('B3').Value2 = '1900'
    $infoSheet.Range('A4').Value2 = '计算模式'
    $infoSheet.Range('B4').Value2 = '自动重算'
    $infoSheet.Range('A5').Value2 = '自检公式'
    $infoSheet.Range('B5').Formula = '=1+1'
    $selfCheck = Get-CellValue -Cell $infoSheet.Range('B5')
    Write-Log ("自检 =1+1 -> {0} {1}" -f $selfCheck.type, $selfCheck.value)
    if ($selfCheck.type -ne 'number' -or $selfCheck.value -ne 2) { throw 'Excel self-check failed' }

    $results = [ordered]@{}
    $count = 0
    $swTotal = [System.Diagnostics.Stopwatch]::StartNew()
    foreach ($c in $caseList) {
        $count++
        $caseSw = [System.Diagnostics.Stopwatch]::StartNew()
        $entry = [ordered]@{
            status = 'ok'
            value = $null
            displayText = ''
            range = $null
            elapsedMs = 0
            message = ''
        }
        $ws = $null
        try {
            $ws = $wb.Worksheets.Add()
            $ws.Name = [string]$c.id
            # 列宽：避免文本显示被截断/###，只影响显示文本，不影响计算结果
            $ws.Range('A1:G1').ColumnWidth = 16
            $ws.Range('H1:AZ1').ColumnWidth = 22

            $data = $c.data
            if ($null -ne $data -and @($data).Count -gt 0) {
                $rows = @($data).Count
                $cols = 0
                foreach ($row in $data) { $n = @($row).Count; if ($n -gt $cols) { $cols = $n } }
                # 先整块写入（数字/布尔按原类型写入），再对文本单元格做纠正：
                # COM 批量赋值会把 "100" 变成数值 100、把 "" 变成空白单元格，从而改变
                # AVERAGE/MAX/COUNTA 等函数对“文本/空值”的处理，因此文本单元格要单独按文本写回。
                $arr = New-Object 'object[,]' $rows, $cols
                for ($i = 0; $i -lt $rows; $i++) {
                    $row = @($data[$i])
                    for ($j = 0; $j -lt $cols; $j++) {
                        $arr[$i, $j] = if ($j -lt $row.Count -and $row[$j] -isnot [pscustomobject]) { $row[$j] } else { $null }
                    }
                }
                $ws.Range('A1').Resize($rows, $cols).Value2 = $arr
                for ($i = 0; $i -lt $rows; $i++) {
                    $row = @($data[$i])
                    for ($j = 0; $j -lt $cols; $j++) {
                        if ($j -ge $row.Count) { continue }
                        $v = $row[$j]
                        $cell = $ws.Cells.Item($i + 1, $j + 1)
                        if ($v -is [string]) {
                            if ($v -eq '') { $cell.Formula = '=""' }
                            else { $cell.NumberFormat = '@'; $cell.Value2 = [string]$v }
                        }
                        elseif ($v -is [pscustomobject]) {
                            $errorFormulas = @{ '#N/A' = '=NA()'; '#DIV/0!' = '=1/0'; '#VALUE!' = '=VALUE("not-a-number")'; '#NUM!' = '=SQRT(-1)' }
                            if ($v.type -ne 'error' -or -not $errorFormulas.ContainsKey([string]$v.value)) { throw 'Unsupported error input' }
                            $cell.Formula = $errorFormulas[[string]$v.value]
                        }
                    }
                }
            }

            $inputRows = New-Object System.Collections.ArrayList
            foreach ($rowIndex in 0..([math]::Max(@($data).Count - 1, 0))) {
                if ($null -eq $data -or $rowIndex -ge @($data).Count) { break }
                $inputRow = @($data[$rowIndex])
                $values = New-Object 'object[]' $inputRow.Count
                for ($columnIndex = 0; $columnIndex -lt $inputRow.Count; $columnIndex++) {
                    $values[$columnIndex] = Get-CellValue -Cell $ws.Cells.Item($rowIndex + 1, $columnIndex + 1)
                }
                [void]$inputRows.Add($values)
            }
            $entry.inputs = $inputRows

            $formulaCell = [string]$c.formulaCell
            if ([string]::IsNullOrEmpty($formulaCell)) { $formulaCell = 'H1' }
            $cell = $ws.Range($formulaCell)
            # 多单元格结果以 CSE 数组公式计算，不覆盖原生溢出行为。
            $useCSE = $false
            if ($c.readRange) {
                try {
                    $rr = $ws.Range([string]$c.readRange)
                    if ([int]$rr.Count -gt 1 -and $c.arrayMode -ne 'native') { $useCSE = $true }
                }
                catch { $useCSE = $false }
            }
            try {
                if ($useCSE) {
                    $ws.Range([string]$c.readRange).FormulaArray = [string]$c.formula
                }
                elseif ($c.arrayMode -eq 'native') {
                    $cell.Formula2 = [string]$c.formula
                    $xl.CalculateFull()
                    if (-not $cell.HasSpill) { throw 'Native spill range unavailable' }
                    $spill = $cell.SpillingToRange
                    $entry.spill = [ordered]@{ row = [int]$spill.Row - 1; column = [int]$spill.Column - 1; rows = [int]$spill.Rows.Count; columns = [int]$spill.Columns.Count }
                }
                else {
                    $cell.Formula = [string]$c.formula
                }
            }
            catch {
                $entry.status = 'engineError'
                $entry.message = '公式写入失败: ' + $_.Exception.Message
            }

            if ($entry.status -eq 'ok') {
                $value = Get-CellValue -Cell $cell
                $entry.value = $value
                try { $entry.displayText = [string]$cell.Text } catch { $entry.displayText = '' }
                if ($value.type -eq 'error') { $entry.status = 'formulaError' }
                if ($c.readRange) {
                    try {
                        $entry.range = Get-RangeMatrix -Worksheet $ws -RangeRef ([string]$c.readRange)
                    }
                    catch {
                        $entry.status = 'engineError'
                        $entry.message = '结果区域读取失败: ' + $_.Exception.Message
                    }
                }
            }
        }
        catch {
            $entry.status = 'engineError'
            $entry.message = $_.Exception.Message
        }
        finally {
            $caseSw.Stop()
            $entry.elapsedMs = [math]::Round($caseSw.Elapsed.TotalMilliseconds, 3)
            $results[[string]$c.id] = $entry
            if ($count % 50 -eq 0) { Write-Log ("已执行 {0}/{1}" -f $count, $caseList.Count) }
        }
    }
    $swTotal.Stop()
    $meta.workbookSheets = $wb.Worksheets.Count
    $avgMs = if ($caseList.Count -gt 0) { $swTotal.Elapsed.TotalMilliseconds / $caseList.Count } else { 0 }
    $meta.totalMs = [math]::Round($swTotal.Elapsed.TotalMilliseconds, 1)
    $meta.avgCaseMs = [math]::Round($avgMs, 3)
    Write-Log ("用例执行完成：{0} 条，总耗时 {1:N1}s，平均 {2:N2}ms/条" -f $caseList.Count, $swTotal.Elapsed.TotalSeconds, $avgMs)

    # 保存计算工作簿作为原始记录
    $evidence = $workbookPath
    Remove-Item $evidence -ErrorAction SilentlyContinue
    $wb.SaveAs($evidence, 51)  # xlOpenXMLWorkbook
    Write-Log ("计算工作簿已保存 {0}" -f $evidence)

    $finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    $payload = [ordered]@{
        engine = 'excel'
        engineVersion = [string]$xl.Version
        casesSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $casesPath).Hash.ToLowerInvariant()
        startedAt = $startedAt
        finishedAt = $finishedAt
        caseCount = $caseList.Count
        totalElapsedMs = [math]::Round($swTotal.Elapsed.TotalMilliseconds, 1)
        meta = $meta
        selfCheck = [ordered]@{ formula = '=1+1'; value = $selfCheck }
        results = $results
    }
    $json = $payload | ConvertTo-Json -Depth 30
    [System.IO.File]::WriteAllText($outPath, $json, (New-Object System.Text.UTF8Encoding($false)))
    Write-Log ("结果已写入 {0}" -f $outPath)
}
finally {
    if ($wb) { try { $wb.Close($false) } catch {} }
    if ($xl) {
        try { $xl.Quit() } catch {}
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
    $sw.Stop()
    Write-Log ("执行器退出，进程耗时 {0:N1}s" -f $sw.Elapsed.TotalSeconds)
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}










