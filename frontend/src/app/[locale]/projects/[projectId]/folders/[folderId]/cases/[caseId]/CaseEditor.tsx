'use client';
import { useState, useEffect, useContext, ChangeEvent, DragEvent, useRef } from 'react';
import { Input, Textarea, Select, SelectItem, Divider, addToast } from '@heroui/react';
import { Circle } from 'lucide-react';
import CaseStepsEditor from './CaseStepsEditor';
import CaseAttachmentsEditor from './CaseAttachmentsEditor';
import { updateSteps } from './stepControl';
import { fetchCreateAttachments, fetchDownloadAttachment, fetchDeleteAttachment } from './attachmentControl';
import CaseTagsEditor from './CaseTagsEditor';
import { fetchCase, updateCase } from '@/utils/caseControl';
import { priorities, testTypes, templates } from '@/config/selection';
import { TokenContext } from '@/utils/TokenProvider';
import { useFormGuard } from '@/utils/formGuard';
import { CaseType, AttachmentType, CaseMessages, StepType } from '@/types/case';
import { PriorityMessages } from '@/types/priority';
import { TestTypeMessages } from '@/types/testType';
import { logError } from '@/utils/errorHandler';
import { updateCaseTags } from '@/utils/caseTagsControls';

const defaultTestCase = {
  id: 0,
  title: '',
  state: 0,
  priority: 0,
  type: 0,
  automationStatus: 0,
  description: '',
  template: 0,
  preConditions: '',
  expectedResults: '',
  folderId: 0,
  Steps: [],
  Attachments: [],
  isIncluded: false,
  runStatus: 0,
  Tags: [],
};

type Props = {
  projectId: string;
  folderId: string;
  caseId: string;
  messages: CaseMessages;
  testTypeMessages: TestTypeMessages;
  priorityMessages: PriorityMessages;
  locale: string;
  onUpdated?: (updatedCase: CaseType) => void;
};

export default function CaseEditor({
  projectId,
  folderId,
  caseId,
  messages,
  testTypeMessages,
  priorityMessages,
  locale,
  onUpdated,
}: Props) {
  const tokenContext = useContext(TokenContext);
  const [testCase, setTestCase] = useState<CaseType>(defaultTestCase);
  const [isTitleInvalid] = useState<boolean>(false);
  const [plusCount, setPlusCount] = useState<number>(0);
  const [isDirty, setIsDirty] = useState(false);
  const [selectedTags, setSelectedTags] = useState<{ id: number; name: string }[]>([]);
  const stepsRef = useRef<StepType[]>([]);

  useFormGuard(isDirty, messages.areYouSureLeave);

  const saveCaseData = async (nextCase: CaseType) => {
    if (!tokenContext.isSignedIn()) return;
    try {
      await updateCase(tokenContext.token.access_token, nextCase);
      setIsDirty(false);
      onUpdated?.(nextCase);
    } catch (error) {
      logError('Error updating test case', error);
      addToast({
        title: 'Error',
        description: messages.errorUpdatingTestCase,
        color: 'danger',
      });
    } finally {
    }
  };

  const saveSteps = async (steps: StepType[]) => {
    if (!tokenContext.isSignedIn()) return;
    try {
      await updateSteps(tokenContext.token.access_token, Number(caseId), steps);
      const refreshed = await fetchCase(tokenContext.token.access_token, Number(caseId));
      if (refreshed && refreshed.Steps) {
        refreshed.Steps.forEach((step: StepType) => {
          step.editState = 'notChanged';
        });
        setTestCase(refreshed);
        stepsRef.current = refreshed.Steps || [];
        if (refreshed.Tags) {
          setSelectedTags(Array.isArray(refreshed.Tags) ? refreshed.Tags : []);
        }
      }
      setIsDirty(false);
    } catch (error) {
      logError('Error updating steps', error);
      addToast({
        title: 'Error',
        description: messages.errorUpdatingTestCase,
        color: 'danger',
      });
    } finally {
    }
  };

  const saveTags = async (tags: { id: number; name: string }[]) => {
    if (!tokenContext.isSignedIn()) return;
    try {
      const tagIds = tags.map((tag) => tag.id);
      await updateCaseTags(tokenContext.token.access_token, Number(caseId), tagIds, projectId);
      setIsDirty(false);
    } catch (error) {
      logError('Error updating case tags', error);
      addToast({
        title: 'Error',
        description: messages.errorUpdatingTestCase,
        color: 'danger',
      });
    } finally {
    }
  };

  const onPlusClick = async (newStepNo: number) => {
    setIsDirty(true);
    const newStep: StepType = {
      id: plusCount,
      step: '',
      result: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      caseSteps: {
        stepNo: newStepNo,
      },
      uid: `uid${plusCount}`,
      editState: 'new',
    };
    setPlusCount(plusCount + 1);

    if (testCase.Steps) {
      const updatedSteps = testCase.Steps.map((step) => {
        if (step.caseSteps.stepNo >= newStepNo) {
          return {
            ...step,
            editState: step.editState === 'notChanged' ? 'changed' : step.editState,
            caseSteps: {
              ...step.caseSteps,
              stepNo: step.caseSteps.stepNo + 1,
            },
          };
        }
        return step;
      });

      updatedSteps.push(newStep);

      setTestCase({
        ...testCase,
        Steps: updatedSteps,
      });
      stepsRef.current = updatedSteps;
    }
  };

  const onDeleteClick = async (stepId: number) => {
    setIsDirty(true);

    // find deletedStep's stepNo
    if (testCase.Steps) {
      const deletedStep = testCase.Steps.find((step) => step.id === stepId);
      if (!deletedStep) {
        return;
      }
      const deletedStepNo = deletedStep.caseSteps.stepNo;
      deletedStep.editState = 'deleted';

      const updatedSteps = testCase.Steps.map((step) => {
        if (step.caseSteps.stepNo > deletedStepNo) {
          return {
            ...step,
            editState: step.editState === 'notChanged' ? 'changed' : step.editState,
            caseSteps: {
              ...step.caseSteps,
              stepNo: step.caseSteps.stepNo - 1,
            },
          };
        }
        return step;
      });

      setTestCase({
        ...testCase,
        Steps: updatedSteps,
      });
      stepsRef.current = updatedSteps;
      await saveSteps(updatedSteps);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (event.dataTransfer) {
      const filesArray = Array.from(event.dataTransfer.files);
      handleFetchCreateAttachments(Number(caseId), filesArray);
    }
  };

  const handleInput = (event: ChangeEvent) => {
    if (event.target) {
      const input = event.target as HTMLInputElement;
      if (input.files) {
        const filesArray = Array.from(input.files);
        handleFetchCreateAttachments(Number(caseId), filesArray);
      }
    }
  };

  const handleFetchCreateAttachments = async (caseId: number, files: File[]) => {
    const newAttachments = await fetchCreateAttachments(caseId, files);

    if (newAttachments) {
      const newAttachmentsWithJoinTable = [];
      newAttachments.forEach((attachment: AttachmentType) => {
        attachment.caseAttachments = {
          createdAt: new Date(),
          updatedAt: new Date(),
          caseId: 0,
          attachmentId: attachment.id,
        };
        newAttachmentsWithJoinTable.push(attachment);
      });
      const updatedAttachments = testCase.Attachments;
      if (updatedAttachments) {
        updatedAttachments.push(...newAttachments);

        setTestCase({
          ...testCase,
          Attachments: updatedAttachments,
        });
      }
    }
  };

  const onAttachmentDelete = async (attachmentId: number) => {
    await fetchDeleteAttachment(attachmentId);
    if (testCase.Attachments) {
      const filteredAttachments = testCase.Attachments.filter((attachment) => attachment.id !== attachmentId);

      setTestCase({
        ...testCase,
        Attachments: filteredAttachments,
      });
    }
  };

  const onStepUpdate = (stepId: number, changeStep: StepType) => {
    setIsDirty(true);
    if (changeStep.editState === 'notChanged') {
      changeStep.editState = 'changed';
    }

    if (testCase.Steps) {
      const updatedSteps = testCase.Steps.map((step) => {
        if (step.id === stepId) {
          return changeStep;
        }
        return step;
      });
      setTestCase({
        ...testCase,
        Steps: updatedSteps,
      });
      stepsRef.current = updatedSteps;
    }
  };

  useEffect(() => {
    const fetchAndSetCase = async () => {
      if (!tokenContext.isSignedIn()) return;
      try {
        const data = await fetchCase(tokenContext.token.access_token, Number(caseId));
        data.Steps.forEach((step: StepType) => {
          step.editState = 'notChanged';
        });
        setTestCase(data);
        stepsRef.current = data.Steps || [];
        if (data.Tags) {
          setSelectedTags(Array.isArray(data.Tags) ? data.Tags : []);
        }
      } catch (error: unknown) {
        logError('Error fetching case data', error);
      }
    };
    fetchAndSetCase();
  }, [tokenContext, caseId]);

  return (
    <>
      <div className="border-b-1 dark:border-neutral-700 w-full p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="font-semibold truncate max-w-[60vw]">{testCase.title || messages.title}</div>
          {testCase.id ? (
            <span className="text-xs text-default-500">ID: {testCase.id}</span>
          ) : (
            <span className="text-xs text-default-500">ID: {caseId}</span>
          )}
        </div>
      </div>

      <div className="p-5">
        <Input
          size="sm"
          type="text"
          variant="bordered"
          label={messages.title}
          value={testCase.title}
          isInvalid={isTitleInvalid}
          errorMessage={isTitleInvalid ? messages.pleaseEnterTitle : ''}
          onChange={(e) => {
            setTestCase({ ...testCase, title: e.target.value });
            setIsDirty(true);
          }}
          onBlur={(e) => {
            const nextCase = { ...testCase, title: e.target.value };
            setTestCase(nextCase);
            saveCaseData(nextCase);
          }}
          className="mt-3"
        />

        <Textarea
          size="sm"
          variant="bordered"
          label={messages.description}
          placeholder={messages.testCaseDescription}
          value={testCase.description}
          onValueChange={(changeValue) => {
            setTestCase({ ...testCase, description: changeValue });
            setIsDirty(true);
          }}
          onBlur={(e) => {
            const nextCase = { ...testCase, description: e.target.value };
            setTestCase(nextCase);
            saveCaseData(nextCase);
          }}
          className="mt-3"
        />

        <CaseTagsEditor
          projectId={projectId}
          selectedTags={selectedTags}
          onChange={(tags) => {
            setSelectedTags(tags);
            setIsDirty(true);
            saveTags(tags);
          }}
          messages={messages}
        />

        <div>
          <Select
            size="sm"
            variant="bordered"
            selectedKeys={[priorities[testCase.priority].uid]}
            onSelectionChange={(newSelection) => {
              if (newSelection !== 'all' && newSelection.size !== 0) {
                const selectedUid = Array.from(newSelection)[0];
                const index = priorities.findIndex((priority) => priority.uid === selectedUid);
                const nextCase = { ...testCase, priority: index };
                setTestCase(nextCase);
                setIsDirty(true);
                saveCaseData(nextCase);
              }
            }}
            startContent={
              <Circle size={8} color={priorities[testCase.priority].color} fill={priorities[testCase.priority].color} />
            }
            label={messages.priority}
            className="mt-3 max-w-xs"
          >
            {priorities.map((priority) => (
              <SelectItem key={priority.uid}>{priorityMessages[priority.uid]}</SelectItem>
            ))}
          </Select>
        </div>

        <div>
          <Select
            size="sm"
            variant="bordered"
            selectedKeys={[testTypes[testCase.type].uid]}
            onSelectionChange={(newSelection) => {
              if (newSelection !== 'all' && newSelection.size !== 0) {
                const selectedUid = Array.from(newSelection)[0];
                const index = testTypes.findIndex((type) => type.uid === selectedUid);
                const nextCase = { ...testCase, type: index };
                setTestCase(nextCase);
                setIsDirty(true);
                saveCaseData(nextCase);
              }
            }}
            label={messages.type}
            className="mt-3 max-w-xs"
          >
            {testTypes.map((type) => (
              <SelectItem key={type.uid}>{testTypeMessages[type.uid]}</SelectItem>
            ))}
          </Select>
        </div>

        <div>
          <Select
            size="sm"
            variant="bordered"
            selectedKeys={[templates[testCase.template].uid]}
            onSelectionChange={(newSelection) => {
              if (newSelection !== 'all' && newSelection.size !== 0) {
                const selectedUid = Array.from(newSelection)[0];
                const index = templates.findIndex((template) => template.uid === selectedUid);
                const nextCase = { ...testCase, template: index };
                setTestCase(nextCase);
                setIsDirty(true);
                saveCaseData(nextCase);
              }
            }}
            label={messages.template}
            className="mt-3 max-w-xs"
          >
            {templates.map((template) => (
              <SelectItem key={template.uid}>{messages[template.uid]}</SelectItem>
            ))}
          </Select>
        </div>

        <Divider className="my-6" />
        {templates[testCase.template].uid === 'text' && (
          <div>
            <h6 className="font-bold">{messages.testDetail}</h6>
            <div className="flex">
              <Textarea
                size="sm"
                variant="bordered"
                label={messages.preconditions}
                value={testCase.preConditions}
                onValueChange={(changeValue) => {
                  setTestCase({ ...testCase, preConditions: changeValue });
                  setIsDirty(true);
                }}
                onBlur={(e) => {
                  const nextCase = { ...testCase, preConditions: e.target.value };
                  setTestCase(nextCase);
                  saveCaseData(nextCase);
                }}
                className="mt-3 pe-1"
              />

              <Textarea
                size="sm"
                variant="bordered"
                label={messages.expectedResult}
                value={testCase.expectedResults}
                onValueChange={(changeValue) => {
                  setTestCase({ ...testCase, expectedResults: changeValue });
                  setIsDirty(true);
                }}
                onBlur={(e) => {
                  const nextCase = { ...testCase, expectedResults: e.target.value };
                  setTestCase(nextCase);
                  saveCaseData(nextCase);
                }}
                className="mt-3 ps-1"
              />
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center mb-3">
            <h6 className="font-bold">{messages.steps}</h6>
          </div>
          {testCase.Steps && (
            <CaseStepsEditor
              isDisabled={!tokenContext.isProjectDeveloper(Number(projectId))}
              steps={testCase.Steps}
              onStepUpdate={onStepUpdate}
              onStepBlur={() => saveSteps(stepsRef.current)}
              onStepPlus={onPlusClick}
              onStepDelete={onDeleteClick}
              messages={messages}
            />
          )}
        </div>

        <Divider className="my-6" />
        <h6 className="font-bold">{messages.attachments}</h6>
        {testCase.Attachments && (
          <CaseAttachmentsEditor
            isDisabled={!tokenContext.isProjectDeveloper(Number(projectId))}
            attachments={testCase.Attachments}
            onAttachmentDownload={(attachmentId: number, downloadFileName: string) =>
              fetchDownloadAttachment(attachmentId, downloadFileName)
            }
            onAttachmentDelete={onAttachmentDelete}
            onFilesDrop={handleDrop}
            onFilesInput={handleInput}
            messages={messages}
          />
        )}
      </div>
    </>
  );
}
