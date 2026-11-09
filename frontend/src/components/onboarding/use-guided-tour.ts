import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import introJs from "intro.js";
import { toast } from "sonner";

const STEPS = [
  {
    title: "欢迎使用 Lager 仓储 👋",
    intro:
      "这是一套为小团队准备的轻量仓储系统。接下来用 1 分钟带你认识工作台、库存、单据和 AI 助手，随时可以按 Esc 退出。",
  },
  {
    element: '[data-tour="nav-workbench"]',
    title: "工作台",
    intro: "每天从这里开始：查看库存总量、库存价值、低库存提醒和待处理草稿。",
  },
  {
    element: '[data-tour="nav-inventory"]',
    title: "库存与流水",
    intro: "库存余额按商品和仓库汇总；库存流水记录每一次入库、出库、调拨、盘点和调整。",
  },
  {
    element: '[data-tour="nav-business"]',
    title: "业务单据",
    intro: "入库、出库、调拨、盘点都遵循“先保存草稿，再确认执行”。确认后才会真正改变库存。",
  },
  {
    element: '[data-tour="nav-ai"]',
    title: "AI 助手",
    intro: "上传购买截图或粘贴商品链接，AI 会提取商品与数量，生成入库预览，确认后一键入库。",
  },
  {
    element: '[data-tour="nav-settings"]',
    title: "系统设置",
    intro: "管理员可以在这里配置 DeepSeek / Ollama、默认提示词和自动确认策略。",
  },
  {
    element: '[data-tour="tour-button"]',
    title: "随时重新查看",
    intro: "忘了也没关系，点击这里可以随时重新开始新手指引。现在开始录入第一张入库单吧！",
  },
];

export function useGuidedTour(options: { onPrepare?: () => void; onExit?: () => void } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { onPrepare, onExit } = options;

  return useCallback(() => {
    const start = () => {
      onPrepare?.();
      // Let the mobile drawer finish its entrance animation before Intro.js measures targets.
      window.setTimeout(() => {
        const available = STEPS.filter(
          (step) => !step.element || document.querySelector(step.element),
        );
        if (available.length === 0) {
          toast.error("当前页面没有可引导的内容，请回到工作台后重试");
          onExit?.();
          return;
        }

        const tour = introJs();
        tour.setOptions({
          steps: available,
          nextLabel: "下一步",
          prevLabel: "上一步",
          doneLabel: "开始使用",
          skipLabel: "退出",
          showProgress: true,
          showBullets: false,
          exitOnOverlayClick: false,
          disableInteraction: true,
          scrollToElement: true,
          tooltipClass: "lager-intro-tooltip",
          highlightClass: "lager-intro-highlight",
        });
        tour.oncomplete(() => {
          localStorage.setItem("lager_tour_completed", "1");
          toast.success("指引完成，祝使用顺利");
        });
        tour.onexit(() => onExit?.());
        tour.start();
      }, 320);
    };

    if (location.pathname !== "/") {
      navigate("/");
      window.setTimeout(start, 500);
    } else {
      start();
    }
  }, [location.pathname, navigate, onExit, onPrepare]);
}
