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
