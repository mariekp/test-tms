import { Input, Button, Tooltip, Avatar } from '@heroui/react';
import { Plus, Trash } from 'lucide-react';
import { CaseMessages, StepType } from '@/types/case';

type Props = {
  isDisabled: boolean;
  steps: StepType[];
  onStepUpdate: (stepId: number, step: StepType) => void;
  onStepBlur: (stepId: number) => void;
  onStepPlus: (newStepNo: number) => void;
  onStepDelete: (stepId: number) => void;
  messages: CaseMessages;
};

export default function StepsEditor({
  isDisabled,
  steps,
  onStepUpdate,
  onStepBlur,
  onStepPlus,
  onStepDelete,
  messages,
}: Props) {
  // sort steps by junction table's column
  const sortedSteps = steps.slice().sort((a, b) => {
    const stepNoA = a.caseSteps.stepNo;
    const stepNoB = b.caseSteps.stepNo;
    return stepNoA - stepNoB;
  });

  // filter steps
  const filteredSteps = sortedSteps.filter((entry) => entry.editState !== 'deleted');
  const lastStep = filteredSteps[filteredSteps.length - 1];
  const canAddNext = !lastStep || lastStep.step.trim().length > 0;
  const nextStepNo = lastStep ? lastStep.caseSteps.stepNo + 1 : 1;

  return (
    <>
      {filteredSteps.map((step, index) => (
        <div key={index} className="flex items-center my-1" data-step-id={step.id}>
          <Avatar className="me-2" size="sm" name={step.caseSteps.stepNo.toString()} />
          <div className="grow">
            <Input
              size="sm"
              variant="bordered"
              placeholder={messages.detailsOfTheStep}
              value={step.step}
              isDisabled={isDisabled}
              onValueChange={(changeValue) => {
                onStepUpdate(step.id, { ...step, step: changeValue });
              }}
              onBlur={() => {
                if (!isDisabled) {
                  onStepBlur(step.id);
                }
              }}
              onKeyDown={(e) => {
                if (isDisabled) return;
                if (e.key === 'Enter' && !e.shiftKey && canAddNext && step.id === lastStep?.id) {
                  e.preventDefault();
                  onStepPlus(nextStepNo);
                }
                if (e.key === 'Backspace' && step.step.trim().length === 0) {
                  e.preventDefault();
                  const prevStep = filteredSteps[index - 1];
                  onStepDelete(step.id);
                  if (prevStep) {
                    requestAnimationFrame(() => {
                      const input = document.querySelector(
                        `div[data-step-id="${prevStep.id}"] input`
                      ) as HTMLInputElement | null;
                      input?.focus();
                    });
                  }
                }
              }}
            />
          </div>
          <Tooltip content={messages.deleteThisStep} placement="left">
            <Button
              isIconOnly
              size="sm"
              isDisabled={isDisabled}
              className="bg-transparent rounded-full ms-2"
              onPress={() => onStepDelete(step.id)}
            >
              <Trash size={16} />
            </Button>
          </Tooltip>
        </div>
      ))}
      <div className="mt-2">
        <Button
          startContent={<Plus size={16} />}
          size="sm"
          isDisabled={isDisabled || !canAddNext}
          color="primary"
          onPress={() => onStepPlus(nextStepNo)}
        >
          {messages.newStep}
        </Button>
      </div>
    </>
  );
}
