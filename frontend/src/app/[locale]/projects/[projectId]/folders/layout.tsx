import { useTranslations } from 'next-intl';
import FoldersPane from './FoldersPane';
import { FoldersMessages } from '@/types/folder';

export default function FoldersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string; locale: string };
}) {
  const t = useTranslations('Folders');
  const messages: FoldersMessages = {
    folder: t('folder'),
    newFolder: t('new_folder'),
    editFolder: t('edit_folder'),
    deleteFolder: t('delete_folder'),
    folderName: t('folder_name'),
    folderDetail: t('folder_detail'),
    close: t('close'),
    create: t('create'),
    update: t('update'),
    pleaseEnter: t('please_enter'),
    delete: t('delete'),
    areYouSure: t('are_you_sure'),
  };

  return (
    <div className="flex w-full h-full min-h-0 overflow-hidden">
      <FoldersPane projectId={params.projectId} messages={messages} locale={params.locale} />
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
