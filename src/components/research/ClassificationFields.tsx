import { FormField, Input, Select, Textarea } from "@/components/ui/field";
import {
  RESEARCH_STAGES,
  RESEARCH_STAGE_LABELS,
  RESEARCH_TYPES,
  RESEARCH_TYPE_LABELS,
  type ResearchStage,
  type ResearchType,
} from "@/domain/taxonomy";

/**
 * The classification the researcher must set and confirm. Nothing here is
 * pre-filled by inspecting the material: the system may advise, but the
 * researcher decides what kind of research this is.
 */
export function ClassificationFields({
  defaults,
}: {
  defaults?: {
    researchType?: ResearchType;
    researchTypeCustom?: string | null;
    researchStage?: ResearchStage;
    researchStageCustom?: string | null;
    studyGoal?: string | null;
    productVersion?: string | null;
    plannedTasks?: string[];
  };
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField
        label="What type of research material is this?"
        hint="This changes the analytical lens. An interview is not analysed like a usability test."
      >
        <Select name="researchType" defaultValue={defaults?.researchType ?? "user_interview"}>
          {RESEARCH_TYPES.map((type) => (
            <option key={type} value={type}>
              {RESEARCH_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label='If "Other", describe it'>
        <Input name="researchTypeCustom" defaultValue={defaults?.researchTypeCustom ?? ""} />
      </FormField>

      <FormField
        label="What stage of the research or design process is this?"
        hint="Stage affects what counts as evidence — post-launch accounts carry behaviour that a concept test cannot."
      >
        <Select name="researchStage" defaultValue={defaults?.researchStage ?? "exploratory_discovery"}>
          {RESEARCH_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {RESEARCH_STAGE_LABELS[stage]}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label='If "Other", describe the stage'>
        <Input name="researchStageCustom" defaultValue={defaults?.researchStageCustom ?? ""} />
      </FormField>

      <FormField label="Study goal (optional)" hint="Falls back to the project research goal.">
        <Textarea name="studyGoal" rows={2} defaultValue={defaults?.studyGoal ?? ""} />
      </FormField>

      <FormField label="Product / prototype version (optional)">
        <Input name="productVersion" defaultValue={defaults?.productVersion ?? ""} placeholder="Prototype v3" />
      </FormField>

      <FormField
        label="Planned tasks (optional)"
        hint="One per line. Recording these lets a later round tell 'we retested and it did not happen' apart from 'we never tested it'."
      >
        <Textarea name="plannedTasks" rows={3} defaultValue={(defaults?.plannedTasks ?? []).join("\n")} />
      </FormField>
    </div>
  );
}
