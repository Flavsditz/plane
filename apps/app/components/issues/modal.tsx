import React, { useEffect, useState } from "react";

import { useRouter } from "next/router";

import useSWR, { mutate } from "swr";

// headless ui
import { Dialog, Transition } from "@headlessui/react";
// services
import projectService from "services/project.service";
import modulesService from "services/modules.service";
import issuesService from "services/issues.service";
import inboxServices from "services/inbox.service";
// hooks
import useUser from "hooks/use-user";
import useIssuesView from "hooks/use-issues-view";
import useCalendarIssuesView from "hooks/use-calendar-issues-view";
import useToast from "hooks/use-toast";
import useInboxView from "hooks/use-inbox-view";
import useSpreadsheetIssuesView from "hooks/use-spreadsheet-issues-view";
// components
import { IssueForm } from "components/issues";
// types
import type { IIssue } from "types";
// fetch-keys
import {
  PROJECT_ISSUES_DETAILS,
  PROJECT_ISSUES_LIST,
  USER_ISSUE,
  PROJECTS_LIST,
  SUB_ISSUES,
  PROJECT_ISSUES_LIST_WITH_PARAMS,
  CYCLE_ISSUES_WITH_PARAMS,
  MODULE_ISSUES_WITH_PARAMS,
  CYCLE_DETAILS,
  MODULE_DETAILS,
  VIEW_ISSUES,
  INBOX_ISSUES,
} from "constants/fetch-keys";
// constants
import { INBOX_ISSUE_SOURCE } from "constants/inbox";

export interface IssuesModalProps {
  isOpen: boolean;
  handleClose: () => void;
  data?: IIssue | null;
  prePopulateData?: Partial<IIssue>;
  isUpdatingSingleIssue?: boolean;
  fieldsToShow?: (
    | "project"
    | "name"
    | "description"
    | "state"
    | "priority"
    | "assignee"
    | "label"
    | "dueDate"
    | "estimate"
    | "parent"
    | "all"
  )[];
}

export const CreateUpdateIssueModal: React.FC<IssuesModalProps> = ({
  isOpen,
  handleClose,
  data,
  prePopulateData,
  isUpdatingSingleIssue = false,
  fieldsToShow = ["all"],
}) => {
  // states
  const [createMore, setCreateMore] = useState(false);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  const router = useRouter();
  const { workspaceSlug, projectId, cycleId, moduleId, viewId, inboxId } = router.query;

  const { issueView, params } = useIssuesView();
  const { params: calendarParams } = useCalendarIssuesView();
  const { order_by, group_by, ...viewGanttParams } = params;
  const { params: inboxParams } = useInboxView();
  const { params: spreadsheetParams } = useSpreadsheetIssuesView();

  const { user } = useUser();
  const { setToastAlert } = useToast();

  if (cycleId) prePopulateData = { ...prePopulateData, cycle: cycleId as string };
  if (moduleId) prePopulateData = { ...prePopulateData, module: moduleId as string };
  if (router.asPath.includes("my-issues"))
    prePopulateData = {
      ...prePopulateData,
      assignees: [...(prePopulateData?.assignees ?? []), user?.id ?? ""],
    };

  const { data: issues } = useSWR(
    workspaceSlug && activeProject
      ? PROJECT_ISSUES_LIST(workspaceSlug as string, activeProject ?? "")
      : null,
    workspaceSlug && activeProject
      ? () => issuesService.getIssues(workspaceSlug as string, activeProject ?? "")
      : null
  );

  const { data: projects } = useSWR(
    workspaceSlug ? PROJECTS_LIST(workspaceSlug as string) : null,
    workspaceSlug ? () => projectService.getProjects(workspaceSlug as string) : null
  );

  useEffect(() => {
    if (projects && projects.length > 0)
      setActiveProject(projects?.find((p) => p.id === projectId)?.id ?? projects?.[0].id ?? null);
  }, [projectId, projects]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose]);

  const addIssueToCycle = async (issueId: string, cycleId: string) => {
    if (!workspaceSlug || !activeProject) return;

    await issuesService
      .addIssueToCycle(
        workspaceSlug as string,
        activeProject ?? "",
        cycleId,
        {
          issues: [issueId],
        },
        user
      )
      .then(() => {
        if (cycleId) {
          mutate(CYCLE_ISSUES_WITH_PARAMS(cycleId, params));
          mutate(CYCLE_DETAILS(cycleId as string));
        }
      });
  };

  const addIssueToModule = async (issueId: string, moduleId: string) => {
    if (!workspaceSlug || !activeProject) return;

    await modulesService
      .addIssuesToModule(
        workspaceSlug as string,
        activeProject ?? "",
        moduleId as string,
        {
          issues: [issueId],
        },
        user
      )
      .then(() => {
        if (moduleId) {
          mutate(MODULE_ISSUES_WITH_PARAMS(moduleId as string, params));
          mutate(MODULE_DETAILS(moduleId as string));
        }
      });
  };

  const addIssueToInbox = async (formData: Partial<IIssue>) => {
    if (!workspaceSlug || !activeProject || !inboxId) return;

    const payload = {
      issue: {
        name: formData.name,
        description: formData.description,
        description_html: formData.description_html,
        priority: formData.priority,
      },
      source: INBOX_ISSUE_SOURCE,
    };

    await inboxServices
      .createInboxIssue(
        workspaceSlug.toString(),
        activeProject.toString(),
        inboxId.toString(),
        payload,
        user
      )
      .then((res) => {
        setToastAlert({
          type: "success",
          title: "Success!",
          message: "Issue created successfully.",
        });

        router.push(
          `/${workspaceSlug}/projects/${activeProject}/inbox/${inboxId}?inboxIssueId=${res.issue_inbox[0].id}`
        );

        mutate(INBOX_ISSUES(inboxId.toString(), inboxParams));
      })
      .catch(() => {
        setToastAlert({
          type: "error",
          title: "Error!",
          message: "Issue could not be created. Please try again.",
        });
      });
  };

  const calendarFetchKey = cycleId
    ? CYCLE_ISSUES_WITH_PARAMS(cycleId.toString(), calendarParams)
    : moduleId
    ? MODULE_ISSUES_WITH_PARAMS(moduleId.toString(), calendarParams)
    : viewId
    ? VIEW_ISSUES(viewId.toString(), calendarParams)
    : PROJECT_ISSUES_LIST_WITH_PARAMS(activeProject?.toString() ?? "", calendarParams);

  const spreadsheetFetchKey = cycleId
    ? CYCLE_ISSUES_WITH_PARAMS(cycleId.toString(), spreadsheetParams)
    : moduleId
    ? MODULE_ISSUES_WITH_PARAMS(moduleId.toString(), spreadsheetParams)
    : viewId
    ? VIEW_ISSUES(viewId.toString(), spreadsheetParams)
    : PROJECT_ISSUES_LIST_WITH_PARAMS(activeProject?.toString() ?? "", spreadsheetParams);

  const ganttFetchKey = cycleId
    ? CYCLE_ISSUES_WITH_PARAMS(cycleId.toString())
    : moduleId
    ? MODULE_ISSUES_WITH_PARAMS(moduleId.toString())
    : viewId
    ? VIEW_ISSUES(viewId.toString(), viewGanttParams)
    : PROJECT_ISSUES_LIST_WITH_PARAMS(activeProject?.toString() ?? "");

  const createIssue = async (payload: Partial<IIssue>) => {
    if (!workspaceSlug || !activeProject) return;

    if (inboxId) await addIssueToInbox(payload);
    else
      await issuesService
        .createIssues(workspaceSlug as string, activeProject ?? "", payload, user)
        .then(async (res) => {
          mutate(PROJECT_ISSUES_LIST_WITH_PARAMS(activeProject ?? "", params));
          if (payload.cycle && payload.cycle !== "") await addIssueToCycle(res.id, payload.cycle);
          if (payload.module && payload.module !== "")
            await addIssueToModule(res.id, payload.module);

          if (issueView === "calendar") mutate(calendarFetchKey);
          if (issueView === "gantt_chart") mutate(ganttFetchKey);
          if (issueView === "spreadsheet") mutate(spreadsheetFetchKey);

          setToastAlert({
            type: "success",
            title: "Success!",
            message: "Issue created successfully.",
          });

          if (payload.assignees_list?.some((assignee) => assignee === user?.id))
            mutate(USER_ISSUE(workspaceSlug as string));

          if (payload.parent && payload.parent !== "") mutate(SUB_ISSUES(payload.parent));
        })
        .catch(() => {
          setToastAlert({
            type: "error",
            title: "Error!",
            message: "Issue could not be created. Please try again.",
          });
        });

    if (!createMore) handleClose();
  };

  const updateIssue = async (payload: Partial<IIssue>) => {
    await issuesService
      .updateIssue(workspaceSlug as string, activeProject ?? "", data?.id ?? "", payload, user)
      .then((res) => {
        if (isUpdatingSingleIssue) {
          mutate<IIssue>(PROJECT_ISSUES_DETAILS, (prevData) => ({ ...prevData, ...res }), false);
        } else {
          if (issueView === "calendar") mutate(calendarFetchKey);
          if (issueView === "spreadsheet") mutate(spreadsheetFetchKey);
          if (payload.parent) mutate(SUB_ISSUES(payload.parent.toString()));
          mutate(PROJECT_ISSUES_LIST_WITH_PARAMS(activeProject ?? "", params));
        }

        if (payload.cycle && payload.cycle !== "") addIssueToCycle(res.id, payload.cycle);
        if (payload.module && payload.module !== "") addIssueToModule(res.id, payload.module);

        if (!createMore) handleClose();

        setToastAlert({
          type: "success",
          title: "Success!",
          message: "Issue updated successfully.",
        });
      })
      .catch(() => {
        setToastAlert({
          type: "error",
          title: "Error!",
          message: "Issue could not be updated. Please try again.",
        });
      });
  };

  const handleFormSubmit = async (formData: Partial<IIssue>) => {
    if (!workspaceSlug || !activeProject) return;

    const payload: Partial<IIssue> = {
      ...formData,
      assignees_list: formData.assignees ?? [],
      labels_list: formData.labels ?? [],
      description: formData.description ?? "",
      description_html: formData.description_html ?? "<p></p>",
    };

    if (!data) await createIssue(payload);
    else await updateIssue(payload);
  };

  return (
    <Transition.Root show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-20" onClose={() => {}}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-brand-backdrop bg-opacity-50 transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 z-10 overflow-y-auto">
          <div className="my-10 flex items-center justify-center p-4 text-center sm:p-0 md:my-20">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 translate-y-0 sm:scale-100"
              leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            >
              <Dialog.Panel className="relative transform rounded-lg border border-brand-base bg-brand-base p-5 text-left shadow-xl transition-all sm:w-full sm:max-w-2xl">
                <IssueForm
                  issues={issues ?? []}
                  handleFormSubmit={handleFormSubmit}
                  initialData={data ?? prePopulateData}
                  createMore={createMore}
                  setCreateMore={setCreateMore}
                  handleClose={handleClose}
                  projectId={activeProject ?? ""}
                  setActiveProject={setActiveProject}
                  status={data ? true : false}
                  user={user}
                  fieldsToShow={fieldsToShow}
                />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
};
