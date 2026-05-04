import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface EmployeeWarning {
    id: string
    employeeId: string
    issueDate: string
    expiryDate: string | null
    reason: string | null
    documentS3Key: string | null
    documentFileName: string | null
    createdByName: string | null
    createdAt: string
}

export interface CreateWarningInput {
    issueDate: string
    expiryDate?: string
    reason?: string
    file?: File | null
}

export function useEmployeeWarnings(employeeId: string) {
    return useQuery({
        queryKey: ['employee-warnings', employeeId],
        queryFn: () => api.get<{ data: EmployeeWarning[] }>(`/employees/${employeeId}/warnings`).then(r => r.data),
        enabled: !!employeeId,
        staleTime: 30_000,
    })
}

export function useCreateEmployeeWarning(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (input: CreateWarningInput) => {
            let s3Key: string | undefined
            let fileName: string | undefined

            if (input.file) {
                // Step 1: get presigned upload URL
                const urlRes = await api.post<{ data: { uploadUrl: string; s3Key: string; fileName: string } }>(
                    `/employees/${employeeId}/warnings/upload-url`,
                    { fileName: input.file.name, contentType: input.file.type || 'application/octet-stream' },
                )
                s3Key = urlRes.data.s3Key
                fileName = urlRes.data.fileName

                // Step 2: PUT file directly to S3
                const putRes = await fetch(urlRes.data.uploadUrl, {
                    method: 'PUT',
                    body: input.file,
                    headers: { 'Content-Type': input.file.type || 'application/octet-stream' },
                })
                if (!putRes.ok) throw new Error('File upload failed')
            }

            // Step 3: create warning record with optional s3Key
            return api.post<{ data: EmployeeWarning }>(`/employees/${employeeId}/warnings`, {
                issueDate: input.issueDate,
                expiryDate: input.expiryDate || undefined,
                reason: input.reason || undefined,
                s3Key,
                fileName,
            }).then(r => r.data)
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-warnings', employeeId] }),
    })
}

export function useDeleteEmployeeWarning(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (warningId: string) => api.delete(`/employees/${employeeId}/warnings/${warningId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-warnings', employeeId] }),
    })
}

export function useWarningDocumentUrl(employeeId: string) {
    return useMutation({
        mutationFn: (warningId: string) =>
            api.get<{ url: string; fileName: string }>(`/employees/${employeeId}/warnings/${warningId}/download`),
    })
}
