import { eq, and, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { documentTemplates, documentVersions, documents } from '../../db/schema/index.js'

const DEFAULT_TEMPLATES = [
    {
        templateType: 'offer_letter' as const,
        name: 'Offer Letter',
        variables: ['employee.fullName', 'employee.designation', 'employee.department', 'employee.joinDate', 'employee.basicSalary', 'employee.totalSalary', 'company.name', 'company.address', 'date'],
        body: `<h2 style="text-align:center">OFFER LETTER</h2>
<p>Date: {{date}}</p>
<br>
<p>Dear {{employee.fullName}},</p>
<br>
<p>We are pleased to offer you the position of <strong>{{employee.designation}}</strong> in the <strong>{{employee.department}}</strong> department at <strong>{{company.name}}</strong>.</p>
<br>
<h3>Terms of Employment</h3>
<table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;">
  <tr><td><strong>Position</strong></td><td>{{employee.designation}}</td></tr>
  <tr><td><strong>Department</strong></td><td>{{employee.department}}</td></tr>
  <tr><td><strong>Start Date</strong></td><td>{{employee.joinDate}}</td></tr>
  <tr><td><strong>Basic Salary</strong></td><td>AED {{employee.basicSalary}} per month</td></tr>
  <tr><td><strong>Total Package</strong></td><td>AED {{employee.totalSalary}} per month</td></tr>
</table>
<br>
<p>This offer is subject to satisfactory completion of background verification and medical fitness.</p>
<br>
<p>Please confirm your acceptance by signing and returning a copy of this letter.</p>
<br>
<p>Sincerely,<br><strong>{{company.name}}</strong></p>`,
    },
    {
        templateType: 'salary_certificate' as const,
        name: 'Salary Certificate',
        variables: ['employee.fullName', 'employee.employeeNo', 'employee.designation', 'employee.department', 'employee.joinDate', 'employee.basicSalary', 'employee.totalSalary', 'company.name', 'date', 'recipient'],
        body: `<h2 style="text-align:center">SALARY CERTIFICATE</h2>
<p style="text-align:right">Date: {{date}}</p>
<br>
<p>To Whom It May Concern,</p>
<br>
<p>This is to certify that <strong>{{employee.fullName}}</strong> (Employee No: {{employee.employeeNo}}) has been employed with <strong>{{company.name}}</strong> as <strong>{{employee.designation}}</strong> in the <strong>{{employee.department}}</strong> department since <strong>{{employee.joinDate}}</strong>.</p>
<br>
<p>Their current salary package is as follows:</p>
<table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;">
  <tr><td><strong>Basic Salary</strong></td><td>AED {{employee.basicSalary}}</td></tr>
  <tr><td><strong>Total Monthly Salary</strong></td><td>AED {{employee.totalSalary}}</td></tr>
</table>
<br>
<p>This certificate is issued upon the employee's request for {{recipient}} purposes.</p>
<br>
<p>Authorised Signatory<br><strong>{{company.name}}</strong></p>`,
    },
    {
        templateType: 'noc_letter' as const,
        name: 'No Objection Certificate (NOC)',
        variables: ['employee.fullName', 'employee.employeeNo', 'employee.designation', 'company.name', 'date', 'purpose'],
        body: `<h2 style="text-align:center">NO OBJECTION CERTIFICATE</h2>
<p style="text-align:right">Date: {{date}}</p>
<br>
<p>To Whom It May Concern,</p>
<br>
<p>This is to certify that <strong>{{employee.fullName}}</strong> (Employee No: {{employee.employeeNo}}), holding the position of <strong>{{employee.designation}}</strong> at <strong>{{company.name}}</strong>, has our full permission and no objection for <strong>{{purpose}}</strong>.</p>
<br>
<p>We wish them all the best in their endeavours.</p>
<br>
<p>Authorised Signatory<br><strong>{{company.name}}</strong></p>`,
    },
    {
        templateType: 'experience_letter' as const,
        name: 'Experience Letter',
        variables: ['employee.fullName', 'employee.designation', 'employee.department', 'employee.joinDate', 'employee.lastWorkingDay', 'company.name', 'date'],
        body: `<h2 style="text-align:center">EXPERIENCE CERTIFICATE</h2>
<p style="text-align:right">Date: {{date}}</p>
<br>
<p>To Whom It May Concern,</p>
<br>
<p>This is to certify that <strong>{{employee.fullName}}</strong> was employed with <strong>{{company.name}}</strong> as <strong>{{employee.designation}}</strong> in the <strong>{{employee.department}}</strong> department from <strong>{{employee.joinDate}}</strong> to <strong>{{employee.lastWorkingDay}}</strong>.</p>
<br>
<p>During their tenure, they demonstrated professionalism, dedication, and strong performance. We wish them continued success in their future endeavours.</p>
<br>
<p>Authorised Signatory<br><strong>{{company.name}}</strong></p>`,
    },
    {
        templateType: 'warning_letter' as const,
        name: 'Warning Letter',
        variables: ['employee.fullName', 'employee.employeeNo', 'employee.designation', 'company.name', 'date', 'warningType', 'incident', 'expectedBehavior'],
        body: `<h2 style="text-align:center">{{warningType}} WARNING LETTER</h2>
<p style="text-align:right">Date: {{date}}</p>
<br>
<p>Dear {{employee.fullName}},</p>
<br>
<p>This letter serves as a formal <strong>{{warningType}} Warning</strong> regarding the following matter:</p>
<br>
<p><strong>Incident:</strong> {{incident}}</p>
<br>
<p>We expect the following behaviour going forward: {{expectedBehavior}}</p>
<br>
<p>Failure to comply may result in further disciplinary action. Please acknowledge receipt by signing below.</p>
<br>
<p>Sincerely,<br><strong>{{company.name}}</strong> HR Department</p>`,
    },
]

export async function getTemplates(tenantId: string) {
    return db.select().from(documentTemplates)
        .where(and(eq(documentTemplates.tenantId, tenantId), eq(documentTemplates.isActive, true)))
        .orderBy(documentTemplates.templateType)
}

export async function getTemplate(tenantId: string, id: string) {
    const [row] = await db.select().from(documentTemplates)
        .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
        .limit(1)
    return row ?? null
}

export async function createTemplate(tenantId: string, createdBy: string, data: {
    name: string; templateType: string; body: string; variables?: string[]
}) {
    const [row] = await db.insert(documentTemplates).values({
        tenantId,
        createdBy,
        name: data.name,
        templateType: data.templateType as any,
        body: data.body,
        variables: data.variables ?? [],
    } as any).returning()
    return row
}

export async function updateTemplate(tenantId: string, id: string, data: Partial<{ name: string; body: string; variables: string[]; isActive: boolean }>) {
    const [row] = await db.update(documentTemplates)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function deleteTemplate(tenantId: string, id: string) {
    const [row] = await db.update(documentTemplates)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
        .returning()
    return row ?? null
}

/** Render template — replace {{variable}} placeholders with actual values */
export function renderTemplate(body: string, variables: Record<string, string>): string {
    return body.replace(/\{\{([^}]+)\}\}/g, (_, key) => variables[key.trim()] ?? `{{${key.trim()}}}`)
}

/** Seed default templates for a new tenant */
export async function seedDefaultTemplates(tenantId: string, createdBy: string) {
    for (const tmpl of DEFAULT_TEMPLATES) {
        await db.insert(documentTemplates).values({
            tenantId,
            createdBy,
            name: tmpl.name,
            templateType: tmpl.templateType,
            body: tmpl.body,
            variables: tmpl.variables,
        } as any).onConflictDoNothing()
    }
}

// --- Document Versions ---

export async function getDocumentVersions(tenantId: string, documentId: string) {
    return db.select().from(documentVersions)
        .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.tenantId, tenantId)))
        .orderBy(desc(documentVersions.versionNumber))
}

export async function addDocumentVersion(tenantId: string, documentId: string, uploadedBy: string, data: {
    s3Key: string; fileName: string; fileSize?: number; notes?: string
}) {
    // Get current max version
    const versions = await db.select().from(documentVersions)
        .where(and(eq(documentVersions.documentId, documentId), eq(documentVersions.tenantId, tenantId)))
        .orderBy(desc(documentVersions.versionNumber)).limit(1)
    const nextVersion = (versions[0]?.versionNumber ?? 0) + 1

    const [row] = await db.insert(documentVersions).values({
        documentId,
        tenantId,
        versionNumber: nextVersion,
        s3Key: data.s3Key,
        fileName: data.fileName,
        fileSize: data.fileSize,
        uploadedBy,
        notes: data.notes,
    } as any).returning()
    return row
}
