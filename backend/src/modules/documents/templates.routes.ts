import { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, renderTemplate, getDocumentVersions, addDocumentVersion } from './templates.service.js'

export async function templateRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/documents/templates
    fastify.get('/templates', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const data = await getTemplates(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/documents/templates/:id
    fastify.get('/templates/:id', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const row = await getTemplate(request.user.tenantId, request.params.id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Template not found' })
        return reply.send({ data: row })
    })

    // POST /api/v1/documents/templates
    fastify.post('/templates', { ...adminAuth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const { name, templateType, body, variables } = request.body as any
        if (!name || !templateType || !body) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'name, templateType, and body are required' })
        }
        const row = await createTemplate(request.user.tenantId, request.user.id, { name, templateType, body, variables })
        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/documents/templates/:id
    fastify.patch('/templates/:id', { ...adminAuth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const row = await updateTemplate(request.user.tenantId, request.params.id, request.body as any)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Template not found' })
        return reply.send({ data: row })
    })

    // DELETE /api/v1/documents/templates/:id
    fastify.delete('/templates/:id', { ...adminAuth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const row = await deleteTemplate(request.user.tenantId, request.params.id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Template not found' })
        return reply.code(204).send()
    })

    // POST /api/v1/documents/templates/:id/render
    fastify.post('/templates/:id/render', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const tmpl = await getTemplate(request.user.tenantId, request.params.id)
        if (!tmpl) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Template not found' })
        const variables = (request.body as any)?.variables ?? {}
        const rendered = renderTemplate(tmpl.body, variables)
        return reply.send({ data: { rendered, templateType: tmpl.templateType, name: tmpl.name } })
    })

    // GET /api/v1/documents/:id/versions
    fastify.get('/:id/versions', { ...auth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const data = await getDocumentVersions(request.user.tenantId, request.params.id)
        return reply.send({ data })
    })

    // POST /api/v1/documents/:id/versions
    fastify.post('/:id/versions', { ...adminAuth, schema: { tags: ['Documents'] } }, async (request: any, reply: any) => {
        const { s3Key, fileName, fileSize, notes } = request.body as any
        if (!s3Key || !fileName) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 's3Key and fileName are required' })
        const row = await addDocumentVersion(request.user.tenantId, request.params.id, request.user.id, { s3Key, fileName, fileSize, notes })
        return reply.code(201).send({ data: row })
    })
}
