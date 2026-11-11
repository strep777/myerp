import {
  ArrowRight,
  BookOpen,
  Boxes,
  ClipboardList,
  Command,
  FileBarChart,
  Keyboard,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FLOW = [
  {
    icon: Boxes,
    title: "先维护基础资料",
    text: "在「商品」「仓库」「供应商」「客户」中录入档案。商品 SKU 与仓库编码需唯一。",
  },
  {
    icon: PackageCheck,
    title: "入库增加库存",
    text: "创建入库单并添加商品明细，确认后库存增加，同时记录成本与库存流水。",
  },
  {
    icon: ClipboardList,
    title: "出库与调拨",
    text: "出库确认前系统会校验可用库存；调拨会在源仓与目标仓各生成一条流水。",
  },
  {
    icon: FileBarChart,
    title: "盘点与报表",
    text: "盘点按仓库快照账面数量，录入实盘后完成盈亏调整；报表可导出 CSV。",
  },
];

const SHORTCUTS = [
  { keys: ["Esc"], label: "关闭弹窗或抽屉" },
  { keys: ["Tab"], label: "在表单与操作之间移动焦点" },
  { keys: ["Enter"], label: "提交当前表单或确认选择" },
  { keys: ["Space"], label: "打开下拉框或选中选项" },
];

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[min(86dvh,760px)]">
        <DialogHeader>
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent text-primary">
            <BookOpen className="h-[18px] w-[18px]" />
          </div>
          <DialogTitle>使用帮助</DialogTitle>
          <DialogDescription>
            Lager 把日常仓库工作整理成清晰的三步：建档、做单、看报表。
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5 py-2">
          <section>
            <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              <ArrowRight className="h-3.5 w-3.5 text-primary" />
              推荐工作流
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {FLOW.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-[10px] border border-black/[0.055] bg-[#FAFAFC] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-primary shadow-sm">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-[12px] font-semibold">
                        {index + 1}. {item.title}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[12px] leading-[1.55] text-muted-foreground">
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold">
              <Keyboard className="h-3.5 w-3.5 text-primary" />
              键盘操作
            </h3>
            <div className="divide-y divide-black/[0.045] overflow-hidden rounded-[10px] border border-black/[0.055]">
              {SHORTCUTS.map((shortcut) => (
                <div key={shortcut.label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[12px] text-muted-foreground">{shortcut.label}</span>
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-[5px] border border-black/[0.09] bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[10px] border border-primary/10 bg-primary/[0.035] p-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-[12px] font-semibold">数据安全提示</p>
                <p className="mt-1 text-[12px] leading-[1.55] text-muted-foreground">
                  已确认的单据不能编辑，以保证库存流水可追溯。所有写操作都会记录操作人和时间；
                  建议定期在系统信息页查看运行状态，并备份 data 目录中的数据库文件。
                </p>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Command className="h-3.5 w-3.5" />
            遇到异常时，请把页面右下角的请求编号提供给管理员，便于定位问题。
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
