import PDFDocument from 'pdfkit'

interface PayslipData {
    employee: {
        name: string
        employeeNo: string
        designation?: string
        department?: string
        bankName?: string
        iban?: string
    }
    company: {
        name: string
        tradeLicenseNo?: string
    }
    payslip: {
        month: number
        year: number
        basicSalary: number
        housingAllowance: number
        transportAllowance: number
        otherAllowances: number
        grossSalary: number
        totalDeductions: number
        netSalary: number
        daysWorked?: number
        leaveDeduction?: number
    }
}

export async function generatePayslipPdf(data: PayslipData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 })
        const chunks: Buffer[] = []

        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const monthName = new Date(data.payslip.year, data.payslip.month - 1).toLocaleString('en-US', { month: 'long' })
        const period = `${monthName} ${data.payslip.year}`

        // ─── Header ───────────────────────────────────────────────────────────
        doc.rect(0, 0, doc.page.width, 80).fill('#1e293b')
        doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold')
            .text('SALARY PAYSLIP', 50, 25, { align: 'left' })
        doc.fontSize(10).font('Helvetica')
            .text(data.company.name, 50, 50)
        doc.fillColor('#94a3b8')
            .text(period, 0, 30, { align: 'right', width: doc.page.width - 50 })

        // ─── Employee Info ───────────────────────────────────────────────────
        doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold')
            .text('Employee Details', 50, 100)
        doc.moveTo(50, 116).lineTo(doc.page.width - 50, 116).strokeColor('#e2e8f0').stroke()

        const leftCol = 50, rightCol = 320
        let y = 125

        const infoRow = (label: string, value: string, col: number) => {
            doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(label, col, y)
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(value || '—', col, y + 12)
        }

        infoRow('Employee Name', data.employee.name, leftCol)
        infoRow('Employee No.', data.employee.employeeNo, rightCol)
        y += 35
        infoRow('Designation', data.employee.designation ?? '', leftCol)
        infoRow('Department', data.employee.department ?? '', rightCol)
        y += 35
        infoRow('Pay Period', period, leftCol)
        infoRow('Days Worked', data.payslip.daysWorked ? String(data.payslip.daysWorked) : '—', rightCol)

        // ─── Earnings Table ──────────────────────────────────────────────────
        y += 45
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Earnings', leftCol, y)
        doc.moveTo(50, y + 16).lineTo(doc.page.width - 50, y + 16).strokeColor('#e2e8f0').stroke()
        y += 25

        const tableRow = (label: string, amount: number, isTotal = false) => {
            if (isTotal) {
                doc.rect(50, y - 4, doc.page.width - 100, 22).fill('#f1f5f9')
                doc.fillColor('#0f172a')
            } else {
                doc.fillColor('#475569')
            }
            doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica').fontSize(10)
                .text(label, leftCol, y, { width: 250 })
                .text(`AED ${formatCurrency(amount)}`, 0, y, { align: 'right', width: doc.page.width - 50 })
            y += 22
        }

        tableRow('Basic Salary', data.payslip.basicSalary)
        if (data.payslip.housingAllowance > 0) tableRow('Housing Allowance', data.payslip.housingAllowance)
        if (data.payslip.transportAllowance > 0) tableRow('Transport Allowance', data.payslip.transportAllowance)
        if (data.payslip.otherAllowances > 0) tableRow('Other Allowances', data.payslip.otherAllowances)
        tableRow('Gross Salary', data.payslip.grossSalary, true)

        // ─── Deductions Table ────────────────────────────────────────────────
        y += 20
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#0f172a').text('Deductions', leftCol, y)
        doc.moveTo(50, y + 16).lineTo(doc.page.width - 50, y + 16).strokeColor('#e2e8f0').stroke()
        y += 25

        if (data.payslip.leaveDeduction && data.payslip.leaveDeduction > 0) {
            tableRow('Leave Deduction', data.payslip.leaveDeduction)
        }
        if (data.payslip.totalDeductions > 0) {
            tableRow('Total Deductions', data.payslip.totalDeductions, true)
        } else {
            doc.fillColor('#64748b').font('Helvetica').fontSize(9).text('No deductions this period', leftCol, y)
            y += 22
        }

        // ─── Net Pay Box ─────────────────────────────────────────────────────
        y += 20
        doc.rect(50, y, doc.page.width - 100, 50).fill('#1e293b')
        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
            .text('NET PAY', 65, y + 8)
        doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
            .text(`AED ${formatCurrency(data.payslip.netSalary)}`, 65, y + 20)

        // ─── Bank Details ────────────────────────────────────────────────────
        if (data.employee.bankName || data.employee.iban) {
            y += 65
            doc.fillColor('#0f172a').fontSize(11).font('Helvetica-Bold').text('Bank Details', leftCol, y)
            doc.moveTo(50, y + 16).lineTo(doc.page.width - 50, y + 16).strokeColor('#e2e8f0').stroke()
            y += 25
            if (data.employee.bankName) {
                infoRow('Bank Name', data.employee.bankName, leftCol)
            }
            if (data.employee.iban) {
                const maskedIban = data.employee.iban.slice(0, 6) + '****' + data.employee.iban.slice(-4)
                infoRow('IBAN', maskedIban, rightCol)
            }
        }

        // ─── Footer ──────────────────────────────────────────────────────────
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica')
            .text('This is a system-generated payslip. No signature required.', 50, doc.page.height - 50, { align: 'center', width: doc.page.width - 100 })

        doc.end()
    })
}

function formatCurrency(n: number): string {
    return n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─── Generic Report PDF ────────────────────────────────────────────────────

export interface ReportColumn {
    header: string
    key: string
    width?: number
    align?: 'left' | 'right' | 'center'
    currency?: boolean
}

export interface ReportPdfOptions {
    title: string
    subtitle?: string
    companyName: string
    columns: ReportColumn[]
    rows: Record<string, unknown>[]
    generatedBy?: string
}

export async function generateReportPdf(options: ReportPdfOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40, layout: 'landscape' })
        const chunks: Buffer[] = []

        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        const pageW = doc.page.width
        const pageH = doc.page.height
        const marginX = 40

        // ─── Header bar ────────────────────────────────────────────────
        doc.rect(0, 0, pageW, 70).fill('#1e293b')
        doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold')
            .text(options.title.toUpperCase(), marginX, 18, { align: 'left' })
        doc.fillColor('#94a3b8').fontSize(9).font('Helvetica')
            .text(options.companyName, marginX, 42)
        if (options.subtitle) {
            doc.fillColor('#cbd5e1').fontSize(9)
                .text(options.subtitle, 0, 42, { align: 'right', width: pageW - marginX })
        }
        const dateStr = new Date().toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
        doc.fillColor('#64748b').fontSize(8)
            .text(`Generated: ${dateStr}`, 0, 55, { align: 'right', width: pageW - marginX })

        // ─── Column layout ─────────────────────────────────────────────
        const usableWidth = pageW - marginX * 2
        const totalFixedWidth = options.columns.reduce((s, c) => s + (c.width ?? 0), 0)
        const flexCols = options.columns.filter(c => !c.width).length
        const autoWidth = flexCols > 0 ? (usableWidth - totalFixedWidth) / flexCols : 0
        const colWidths = options.columns.map(c => c.width ?? autoWidth)

        let y = 85
        const rowH = 18
        const headerH = 20

        // ─── Table header ──────────────────────────────────────────────
        doc.rect(marginX, y, usableWidth, headerH).fill('#334155')
        let x = marginX
        options.columns.forEach((col, i) => {
            doc.fillColor('#e2e8f0').fontSize(8).font('Helvetica-Bold')
                .text(col.header, x + 4, y + 6, { width: colWidths[i] - 8, align: col.align ?? 'left', lineBreak: false })
            x += colWidths[i]
        })
        y += headerH

        // ─── Rows ──────────────────────────────────────────────────────
        options.rows.forEach((row, rowIdx) => {
            // Page break
            if (y + rowH > pageH - 40) {
                doc.addPage()
                y = 40
                // Re-draw header on new page
                doc.rect(marginX, y, usableWidth, headerH).fill('#334155')
                let hx = marginX
                options.columns.forEach((col, i) => {
                    doc.fillColor('#e2e8f0').fontSize(8).font('Helvetica-Bold')
                        .text(col.header, hx + 4, y + 6, { width: colWidths[i] - 8, align: col.align ?? 'left', lineBreak: false })
                    hx += colWidths[i]
                })
                y += headerH
            }

            const isAlt = rowIdx % 2 === 1
            doc.rect(marginX, y, usableWidth, rowH).fill(isAlt ? '#f8fafc' : '#ffffff')

            x = marginX
            options.columns.forEach((col, i) => {
                const val = row[col.key]
                let text: string
                if (val === null || val === undefined) {
                    text = '—'
                } else if (col.currency && typeof val === 'number') {
                    text = `AED ${formatCurrency(val)}`
                } else {
                    text = String(val)
                }
                doc.fillColor('#334155').fontSize(8).font('Helvetica')
                    .text(text, x + 4, y + 5, { width: colWidths[i] - 8, align: col.align ?? 'left', lineBreak: false })
                x += colWidths[i]
            })

            // Bottom border
            doc.moveTo(marginX, y + rowH).lineTo(marginX + usableWidth, y + rowH).strokeColor('#e2e8f0').lineWidth(0.5).stroke()
            y += rowH
        })

        // ─── Summary row count ─────────────────────────────────────────
        y += 8
        doc.fillColor('#64748b').fontSize(8).font('Helvetica')
            .text(`Total records: ${options.rows.length}`, marginX, y)

        // ─── Footer ────────────────────────────────────────────────────
        doc.fillColor('#94a3b8').fontSize(7).font('Helvetica')
            .text('This is a system-generated report. For internal use only.', marginX, pageH - 25, { align: 'center', width: pageW - marginX * 2 })

        doc.end()
    })
}
