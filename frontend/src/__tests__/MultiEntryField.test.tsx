/**
 * MultiEntryField empty-state regression test.
 *
 * Background: the Experience / Education sections on the candidate forms used
 * to render only the header + "+ Add" button when empty, leaving a confusing
 * blank space below. We now show a dashed-border placeholder with a friendly
 * "No <section> added yet…" message that disappears once an entry exists.
 */
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import {
    MultiEntryField,
    emptyExperience,
    validateExperience,
    experienceSummary,
    type ExperienceEntry,
} from '@/components/shared/MultiEntryField'

/** Controlled wrapper because MultiEntryField is fully controlled. */
function Harness({ initial = [] as ExperienceEntry[] }: { initial?: ExperienceEntry[] }) {
    const [items, setItems] = useState<ExperienceEntry[]>(initial)
    return (
        <MultiEntryField<ExperienceEntry>
            label="Experience"
            optional
            items={items}
            onChange={setItems}
            newItem={emptyExperience}
            validate={validateExperience}
            renderSummary={experienceSummary}
            renderForm={(draft, onChange) => (
                <input
                    aria-label="title-input"
                    value={draft.title}
                    onChange={(e) => onChange({ ...draft, title: e.target.value })}
                />
            )}
        />
    )
}

describe('MultiEntryField empty state', () => {
    it('shows a label-derived empty message when no items exist', () => {
        render(<Harness />)
        expect(screen.getByText(/No experience added yet\. Click \+ Add to add one\./i)).toBeInTheDocument()
    })

    it('disappears once the user opens the add form', () => {
        render(<Harness />)
        // Sanity: empty state visible.
        expect(screen.queryByText(/No experience added yet/i)).toBeInTheDocument()
        // Open the inline add form.
        fireEvent.click(screen.getByRole('button', { name: /add/i }))
        expect(screen.queryByText(/No experience added yet/i)).not.toBeInTheDocument()
    })

    it('does not show the empty state when items already exist', () => {
        render(<Harness initial={[{ title: 'Engineer', company: 'Acme' }]} />)
        expect(screen.queryByText(/No experience added yet/i)).not.toBeInTheDocument()
        expect(screen.getByText(/Engineer · Acme/)).toBeInTheDocument()
    })

    it('honours a custom emptyMessage prop', () => {
        function Custom() {
            const [items, setItems] = useState<ExperienceEntry[]>([])
            return (
                <MultiEntryField<ExperienceEntry>
                    label="Experience"
                    optional
                    items={items}
                    onChange={setItems}
                    newItem={emptyExperience}
                    validate={validateExperience}
                    renderSummary={experienceSummary}
                    renderForm={() => null}
                    emptyMessage="Add your past roles to strengthen your application."
                />
            )
        }
        render(<Custom />)
        expect(screen.getByText(/Add your past roles to strengthen your application\./)).toBeInTheDocument()
    })
})
