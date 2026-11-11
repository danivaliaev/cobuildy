// Copies the field model for the agent function (labels and questions only) from the web source of truth.
import { readFileSync, writeFileSync } from 'node:fs'
const src = JSON.parse(readFileSync('web/src/lib/fields.json', 'utf8'))
const out = {
  sections: Object.fromEntries(src.sections.map(s => [s.id, s.title])),
  fields: src.fields.map(f => ({ key: f.key, section: f.section, label: f.label, gate: f.gate, weight: f.weight, kind: f.kind, question: f.question })),
}
writeFileSync('supabase/functions/agent-chat/fields.json', JSON.stringify(out))
console.log('fields:', out.fields.length)
