'use client';
import { Tree, NodeApi } from 'react-arborist';
import { useState, useEffect, useContext, useRef } from 'react';
import { TokenContext } from '@/utils/TokenProvider';
import { fetchFolders, createFolder } from './foldersControl';
import { fetchCases, moveCases, searchCases, createCase, updateCase, deleteCases } from '@/utils/caseControl';
import { FolderType } from '@/types/folder';
import { CaseType, CasesMessages } from '@/types/case';
import { Folder, ChevronRight, ChevronDown, Bot, Hand, Plus } from 'lucide-react';
import CaseDialog from '@/src/app/[locale]/projects/[projectId]/folders/[folderId]/cases/CaseMoveDialog';

type CreateMode = 'folder' | 'case';

interface NodeData {
  id: string;
  name: string;
  children: NodeData[];
  isCase?: boolean;
  caseData?: CaseType;
  folderId?: number;
  loaded?: boolean;
  parentFolderId?: number | null;
  checked?: boolean;
  indeterminate?: boolean;
  open?: boolean;
  isCreateNode?: boolean;
  createParentId?: number;
}

interface Props {
  projectId: string;
  messages: CasesMessages;
  selectedCaseId?: number;
  onCaseClick?: (caseData: CaseType) => void;
  onCaseUpdated?: (updatedCase: CaseType) => void;
  filter?: string;
  onFilterCount?: (count: number) => void;
  updatedCase?: CaseType; // внешнее обновление из редактора
}

export default function ArboristTree({
  projectId,
  messages,
  selectedCaseId,
  onCaseClick,
  onCaseUpdated,
  filter = '',
  onFilterCount,
  updatedCase,
}: Props) {
  const ctx = useContext(TokenContext);
  const [treeData, setTreeData] = useState<NodeData[]>([]);
  const [allFolders, setAllFolders] = useState<FolderType[]>([]);
  const nodesMapRef = useRef<Record<number, NodeApi<NodeData>>>({});
  const [editingCaseId, setEditingCaseId] = useState<number | null>(null);
  const [editingCaseTitle, setEditingCaseTitle] = useState('');

  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [casesToMove, setCasesToMove] = useState<NodeData[]>([]);
  const [targetFolderId, setTargetFolderId] = useState<number | undefined>(undefined);

  const treeContainerRef = useRef<HTMLDivElement | null>(null);
  const [treeHeight, setTreeHeight] = useState<number>(0);
  const [treeWidth, setTreeWidth] = useState(0);

  // --- Размер дерева ---
  useEffect(() => {
    if (!treeContainerRef.current) return;
    const update = () => {
      setTreeHeight(treeContainerRef.current!.offsetHeight);
      setTreeWidth(treeContainerRef.current!.offsetWidth);
    };
    requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const getRootCreateNode = (): NodeData => ({
    id: 'create-root',
    name: 'New Folder',
    isCreateNode: true,
    createParentId: null,
    children: [],
    loaded: true,
  });

  // --- Загрузка папок ---
  useEffect(() => {
    if (!ctx.isSignedIn()) return;
    fetchFolders(ctx.token.access_token, Number(projectId)).then((folders) => {
      setAllFolders(folders);
      const roots = folders
        .filter((f: FolderType) => f.parentFolderId === null)
        .map((f: FolderType) => ({
          id: `folder-${f.id}`,
          name: f.name,
          children: [],
          folderId: f.id,
          parentFolderId: null,
          loaded: false,
          checked: false,
          indeterminate: false,
          open: false,
        }));
      setTreeData(roots.length ? [...roots, getRootCreateNode()] : [getRootCreateNode()]);
    });
  }, [projectId, ctx]);

  // --- Загрузка кейсов в папку ---
  const loadFolder = async (folder: NodeData) => {
    if (folder.loaded) return; // не грузим повторно
    const subFolders = allFolders.filter((f) => f.parentFolderId === folder.folderId);
    const fetchedCases = await fetchCases(ctx.token.access_token, Number(folder.folderId));

    const children: NodeData[] = [
      ...subFolders.map((f) => ({
        id: `folder-${f.id}`,
        name: f.name,
        children: [],
        folderId: f.id,
        parentFolderId: f.parentFolderId,
        loaded: false,
        checked: false,
        indeterminate: false,
        open: false,
      })),
      ...fetchedCases.map((c: CaseType) => ({
        id: `case-${c.id}`,
        name: c.title,
        isCase: true,
        caseData: c,
        folderId: folder.folderId,
        children: [],
        loaded: true,
      })),
      // Добавляем создающий узел в конец
      {
        id: `create-${folder.folderId}`,
        name: 'New Folder',
        isCreateNode: true,
        createParentId: folder.folderId,
        children: [],
        loaded: true,
      },
    ];

    const updateNodes = (nodes: NodeData[]): NodeData[] =>
      nodes.map((n) =>
        n.id === folder.id
          ? { ...n, children, loaded: true }
          : {
              ...n,
              children: updateNodes(n.children),
            }
      );

    setTreeData((prev) => updateNodes(prev));
  };

  // --- Перезагрузка папки после создания ---
  const reloadFolder = async (folderId: number) => {
    let folder = allFolders.find((f) => f.id === folderId);

    if (!folder) {
      // Если папки нет в allFolders, перезагружаем все папки
      const fetchedFolders = await fetchFolders(ctx.token.access_token, Number(projectId));
      setAllFolders(fetchedFolders);
      folder = fetchedFolders.find((f: FolderType) => f.id === folderId);
      if (!folder) return;
    }

    const findNodeByFolderId = (nodes: NodeData[]): NodeData | undefined => {
      for (const n of nodes) {
        if (n.folderId === folderId) return n;
        const found = findNodeByFolderId(n.children);
        if (found) return found;
      }
      return undefined;
    };

    const existingNode = findNodeByFolderId(treeData);

    const targetNode: NodeData =
      existingNode
        ? { ...existingNode, loaded: false }
        : {
            id: `folder-${folderId}`,
            name: folder.name,
            folderId: folderId,
            parentFolderId: folder.parentFolderId,
            children: [],
            loaded: false,
            checked: false,
            indeterminate: false,
            open: false,
          };

    await loadFolder(targetNode);
  };

  // --- Клик по узлу ---
  const handleClick = async (node: NodeApi<NodeData>) => {
    if (node.data.isCase && node.data.caseData) {
      onCaseClick?.(node.data.caseData);
      return;
    }
    node.toggle();
    await loadFolder(node.data);
  };

  // --- Внешнее обновление кейса (из редактора) ---
  useEffect(() => {
    if (!updatedCase) return;
    const recursiveUpdate = (nodes: NodeData[]): NodeData[] =>
      nodes.map((n) => {
        if (n.isCase && n.caseData?.id === updatedCase.id) {
          return { ...n, name: updatedCase.title, caseData: { ...updatedCase } };
        }
        return { ...n, children: recursiveUpdate(n.children) };
      });
    setTreeData((prev) => recursiveUpdate(prev));
    onCaseUpdated?.(updatedCase);
  }, [updatedCase, onCaseUpdated]);

  // --- Чекбоксы ---
  const toggleCheck = (node: NodeApi<NodeData>) => {
    const newState = !node.data.checked;
    const updateChildren = (nodes: NodeData[], state: boolean): NodeData[] =>
      nodes.map((n) => ({ ...n, checked: state, indeterminate: false, children: updateChildren(n.children, state) }));
    const applyUpdate = (nodes: NodeData[]): NodeData[] =>
      nodes.map((n) =>
        n.id === node.data.id
          ? { ...n, checked: newState, indeterminate: false, children: updateChildren(n.children, newState) }
          : { ...n, children: applyUpdate(n.children) }
      );
    const updateParents = (nodes: NodeData[]): NodeData[] => {
      const process = (n: NodeData): NodeData => {
        if (!n.children.length) return n;
        const children = n.children.map(process);
        const allChecked = children.every((c) => c.checked);
        const noneChecked = children.every((c) => !c.checked && !c.indeterminate);
        return { ...n, children, checked: allChecked, indeterminate: !allChecked && !noneChecked };
      };
      return nodes.map(process);
    };
    setTreeData(updateParents(applyUpdate(treeData)));
  };

  // --- Drag & Drop ---
  const handleMove = async ({ dragIds, parentNode }: { dragIds: string[]; parentNode: NodeApi<NodeData> | null }) => {
    if (!parentNode?.data.folderId) return;
    const targetId = parentNode.data.folderId;
    const getCheckedCases = (nodes: NodeData[]): NodeData[] => {
      let result: NodeData[] = [];
      for (const n of nodes) {
        if (n.isCase && n.checked) result.push(n);
        result = result.concat(getCheckedCases(n.children));
      }
      return result;
    };
    const selectedCases = getCheckedCases(treeData);
    const dragCases = dragIds.map((id) => nodesMapRef.current[Number(id.replace('case-', ''))]?.data).filter(Boolean);
    const finalCases = selectedCases.length ? selectedCases : dragCases;
    if (!finalCases.length) return;
    setCasesToMove(finalCases);
    setTargetFolderId(targetId);
    setIsMoveDialogOpen(true);
  };

  const handleMoved = async () => {
    if (!targetFolderId) return;
    const caseIds = casesToMove.map((c) => c.caseData!.id);
    const success = await moveCases(ctx.token.access_token, caseIds, targetFolderId, Number(projectId));
    if (!success) return;

    const movedCases = casesToMove.map((c) => ({
      ...c,
      folderId: targetFolderId,
      id: `case-${c.caseData!.id}`,
      name: c.caseData!.title,
      isCase: true,
      children: [],
      loaded: true,
      checked: false,
      indeterminate: false,
    }));

    const removeNodes = (nodes: NodeData[]): NodeData[] =>
      nodes
        .map((n) => ({ ...n, children: removeNodes(n.children) }))
        .filter((n) => !caseIds.includes(n.caseData?.id ?? -1));

    const addToTargetFolder = (nodes: NodeData[]): NodeData[] =>
      nodes.map((n) => {
        if (n.folderId === targetFolderId) {
          const existingCases = n.children.filter((child) => child.isCase);
          const nonCaseChildren = n.children.filter((child) => !child.isCase);
          const newCases = movedCases.filter(
            (mc) => !existingCases.some((ec) => ec.caseData?.id === mc.caseData?.id)
          );
          return {
            ...n,
            children: [...nonCaseChildren, ...existingCases, ...newCases],
            loaded: true,
          };
        }
        return { ...n, children: addToTargetFolder(n.children) };
      });

    setTreeData((prev) => addToTargetFolder(removeNodes(prev)));
    setIsMoveDialogOpen(false);
  };

  // --- Компонент для создания нового элемента ---
  const CreateNodeRow = ({
    parentFolderId,
    style,
    level,
  }: {
    parentFolderId: number | null;
    style: React.CSSProperties;
    level: number;
  }) => {
    const [mode, setMode] = useState<CreateMode>('folder');
    const [value, setValue] = useState('');
    const [isHovered, setIsHovered] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleModeSwitch = (newMode: CreateMode) => {
      setMode(newMode);
      setValue('');
      inputRef.current?.focus();
    };

    const handleCreate = async () => {
      const trimmedValue = value.trim();
      if (!trimmedValue) return;

      if (mode === 'folder') {
        const newFolder = await createFolder(
          ctx.token.access_token,
          trimmedValue,
          '',
          projectId,
          parentFolderId
        );

        if (newFolder) {
          setAllFolders((prev) => [...prev, newFolder]);

          if (parentFolderId === null) {
            setTreeData((prev) => {
              const withoutRootCreate = prev.filter(
                (node) => !(node.isCreateNode && node.createParentId === null)
              );
              const createNode = prev.find((node) => node.isCreateNode && node.createParentId === null);
              const newRootNode: NodeData = {
                id: `folder-${newFolder.id}`,
                name: newFolder.name,
                children: [],
                folderId: newFolder.id,
                parentFolderId: null,
                loaded: false,
                checked: false,
                indeterminate: false,
                open: false,
              };

              return createNode ? [...withoutRootCreate, newRootNode, createNode] : [...withoutRootCreate, newRootNode];
            });
          }
        }
      } else {
        if (parentFolderId === null) return;

        const newCase = await createCase(ctx.token.access_token, String(parentFolderId), trimmedValue, '');

        if (newCase && onCaseClick) {
          onCaseClick(newCase);
        }
      }

      setValue('');
      setMode('folder');
      if (parentFolderId !== null) {
        await reloadFolder(parentFolderId);
      } else {
        setTreeData((prev) => {
          const createNode = prev.find((node) => node.isCreateNode && node.createParentId === null);
          return createNode ? [createNode] : prev;
        });
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleCreate();
      } else if (e.key === 'Escape') {
        setValue('');
        setMode('folder');
        inputRef.current?.blur();
      }
    };

    return (
      <div
        style={{
          ...style,
          display: 'flex',
          flex: '1 1 auto',
          paddingLeft: level * 12,
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          alignItems: 'center',
          gap: '8px',
        }}
        className="tree-row create-node-row"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="icon-wrap">
          {mode === 'folder' ? (
            <Folder size={17} strokeWidth={1.4} />
          ) : (
            <Plus size={17} strokeWidth={1.4} />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setValue('');
            setMode('folder');
          }}
          placeholder={mode === 'folder' ? 'New Folder' : 'New Test Case'}
          className="create-node-input"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: 'inherit',
          }}
        />

        {isHovered && (
          <div className="create-hint">
            <span style={{ opacity: 0.6 }}>or </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleModeSwitch(mode === 'folder' ? 'case' : 'folder');
              }}
              className="mode-switch-button"
            >
              {mode === 'folder' ? 'TestCase' : 'Suite'}
            </button>
          </div>
        )}
      </div>
    );
  };

  // --- Иконка кейса ---
  const renderCaseIcon = (caseData: CaseType) =>
    caseData.automationStatus === 1 ? <Bot size={16} strokeWidth={1.5} /> : <Hand size={16} strokeWidth={1.5} />;

  const updateCaseTitleInTree = (caseId: number, title: string) => {
    const updateNodes = (nodes: NodeData[]): NodeData[] =>
      nodes.map((n) => {
        if (n.isCase && n.caseData?.id === caseId) {
          return { ...n, name: title, caseData: { ...n.caseData, title } };
        }
        return { ...n, children: updateNodes(n.children) };
      });
    setTreeData((prev) => updateNodes(prev));
  };

  const removeCaseFromTree = (caseId: number) => {
    const removeNodes = (nodes: NodeData[]): NodeData[] =>
      nodes
        .map((n) => ({ ...n, children: removeNodes(n.children) }))
        .filter((n) => !(n.isCase && n.caseData?.id === caseId));
    setTreeData((prev) => removeNodes(prev));
  };

  // --- Состояние open для фильтрации ---
  const openStateMap = useRef(new Map<number, boolean>());
  const saveOpenState = (nodes: NodeData[]) => {
    nodes.forEach((n) => {
      if (n.folderId) openStateMap.current.set(n.folderId, n.open ?? false);
      if (n.children.length) saveOpenState(n.children);
    });
  };
  saveOpenState(treeData);

  // --- Фильтрация только при trigger ---
  useEffect(() => {
    if (!filter.trim()) {
      // --- сброс к исходному дереву ---
      const loadFullTree = async () => {
        // сначала корневые папки
        const roots = allFolders
          .filter((f) => f.parentFolderId === null)
          .map((f) => ({
            id: `folder-${f.id}`,
            name: f.name,
            folderId: f.id,
            parentFolderId: null,
            children: [],
            loaded: false,
            checked: false,
            indeterminate: false,
            open: false,
          }));

        setTreeData(roots.length ? [...roots, getRootCreateNode()] : [getRootCreateNode()]);

        // рекурсивно подгружаем кейсы для всех папок
        const loadCasesRecursively = async (nodes: NodeData[]) => {
          for (const node of nodes) {
            if (node.folderId) {
              await loadFolder(node);
              if (node.children.length) await loadCasesRecursively(node.children);
            }
          }
        };

        await loadCasesRecursively(roots);
      };

      loadFullTree();
      onFilterCount?.(0);
      return;
    }

    const loadFilteredTree = async () => {
      const cases: CaseType[] = await searchCases(ctx.token.access_token, Number(projectId), filter);
      onFilterCount?.(cases.length);

      const folderMap: Record<number, NodeData> = {};
      cases.forEach((c) => {
        let f = allFolders.find((f) => f.id === c.folderId);
        if (!f) return;
        const path: FolderType[] = [];
        while (f) {
          path.unshift(f);
          f = f.parentFolderId !== null ? allFolders.find((x) => x.id === f?.parentFolderId) : undefined;
        }

        let parentNode: NodeData | undefined;
        path.forEach((folder) => {
          if (!folderMap[folder.id]) {
            folderMap[folder.id] = {
              id: `folder-${folder.id}`,
              name: folder.name,
              folderId: folder.id,
              parentFolderId: folder.parentFolderId,
              children: [],
              loaded: true,
              checked: false,
              indeterminate: false,
              open: openStateMap.current.get(folder.id) ?? false,
            };
          }
          if (parentNode) {
            const exists = parentNode.children.find((c) => c.id === `folder-${folder.id}`);
            if (!exists) parentNode.children.push(folderMap[folder.id]);
          }
          parentNode = folderMap[folder.id];
        });

        parentNode?.children.push({
          id: `case-${c.id}`,
          name: c.title,
          isCase: true,
          caseData: c,
          folderId: c.folderId,
          children: [],
          loaded: true,
        });
      });

      const roots: NodeData[] = [];
      Object.values(folderMap).forEach((node) => {
        if (node.parentFolderId === null) roots.push(node);
      });

      // Добавляем создающие узлы для каждой папки
      Object.values(folderMap).forEach((node) => {
        node.children.push({
          id: `create-${node.folderId}`,
          name: 'New Folder',
          isCreateNode: true,
          createParentId: node.folderId,
          children: [],
          loaded: true,
        });
      });

      setTreeData(roots);
    };

    loadFilteredTree();
  }, [filter]);

  return (
    <>
      <div
        ref={treeContainerRef}
        style={{
          height: '100%',
          width: '100%',
          minWidth: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
        }}
      >
        {treeHeight > 0 && (
          <Tree
            data={treeData}
            height={treeHeight}
            width={treeWidth}
            childrenAccessor="children"
            openByDefault={false}
            onMove={handleMove}
            disableDrag={(node) => !node.isCase || node.isCreateNode === true}
            disableDrop={({ parentNode }) => !parentNode?.data.folderId}
          >
            {({ node, style, dragHandle }) => {
              if (node.data.isCase && node.data.caseData) {
                nodesMapRef.current[node.data.caseData.id] = node;
              }

              // Рендеринг создающего узла (только для разработчиков)
              if (node.data.isCreateNode && node.data.createParentId) {
                if (!ctx.isProjectDeveloper(Number(projectId))) {
                  return null;
                }
                return <CreateNodeRow parentFolderId={node.data.createParentId} style={style} level={node.level} />;
              }

              // Рендеринг обычных узлов
              return (
                <div
                  style={{
                    ...style,
                    display: 'flex',
                    flex: '1 1 auto',
                    paddingLeft: node.level * 12,
                    width: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                  className={`tree-row ${node.data.isCase && node.data.caseData?.id === selectedCaseId ? 'selected-case' : ''}`}
                  onClick={() => handleClick(node)}
                  ref={dragHandle}
                >
                  <input
                    type="checkbox"
                    checked={node.data.checked || false}
                    ref={(el) => {
                      if (el) el.indeterminate = node.data.indeterminate || false;
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCheck(node);
                    }}
                    className="checkbox-input"
                  />
                  <div className="icon-wrap">
                    {node.data.isCase && node.data.caseData ? (
                      renderCaseIcon(node.data.caseData)
                    ) : (
                      <>
                        <Folder className="folder-icon" size={17} strokeWidth={1.4} />
                        {!node.isOpen ? (
                          <ChevronRight className="hover-icon" size={17} strokeWidth={1.6} />
                        ) : (
                          <ChevronDown className="hover-icon" size={17} strokeWidth={1.6} />
                        )}
                      </>
                    )}
                  </div>
                  {node.data.isCase && node.data.caseData ? (
                    editingCaseId === node.data.caseData.id ? (
                      <input
                        value={editingCaseTitle}
                        className="title bg-transparent outline-none border-none w-full"
                        onChange={(e) => setEditingCaseTitle(e.target.value)}
                        onBlur={async () => {
                          const trimmed = editingCaseTitle.trim();
                          setEditingCaseId(null);
                          if (!trimmed || !node.data.caseData) {
                            setEditingCaseTitle('');
                            return;
                          }
                          const updatedCase = { ...node.data.caseData, title: trimmed };
                          try {
                            await updateCase(ctx.token.access_token, updatedCase);
                            updateCaseTitleInTree(updatedCase.id, trimmed);
                            onCaseUpdated?.(updatedCase);
                          } catch (error) {
                            console.error('Error updating case title', error);
                          }
                        }}
                        onKeyDown={async (e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditingCaseId(null);
                            setEditingCaseTitle('');
                          }
                          if (e.key === 'Backspace' && editingCaseTitle.trim().length === 0 && node.data.caseData) {
                            e.preventDefault();
                            try {
                              await deleteCases(ctx.token.access_token, [node.data.caseData.id], Number(projectId));
                              removeCaseFromTree(node.data.caseData.id);
                            } catch (error) {
                              console.error('Error deleting case', error);
                            } finally {
                              setEditingCaseId(null);
                              setEditingCaseTitle('');
                            }
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="title"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (!ctx.isProjectDeveloper(Number(projectId))) return;
                          setEditingCaseId(node.data.caseData!.id);
                          setEditingCaseTitle(node.data.caseData!.title || '');
                        }}
                      >
                        {node.data.name}
                      </span>
                    )
                  ) : (
                    <span className="title">{node.data.name}</span>
                  )}
                </div>
              );
            }}
          </Tree>
        )}
      </div>

      {isMoveDialogOpen && (
        <CaseDialog
          isOpen={isMoveDialogOpen}
          testCaseIds={casesToMove.map((c) => c.caseData!.id)}
          projectId={projectId}
          targetFolderId={targetFolderId}
          isDisabled={!ctx.isProjectDeveloper(Number(projectId))}
          onCancel={() => setIsMoveDialogOpen(false)}
          onMoved={handleMoved}
          messages={messages}
          token={ctx.token.access_token}
        />
      )}
    </>
  );
}
