import type { SVGProps } from "react"

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
)

export const PlusIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>
export const TrashIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></Icon>
export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></Icon>
export const PaperclipIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m20.5 11.5-8.8 8.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" /></Icon>
export const MicIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></Icon>
export const SendIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Icon>
export const StopIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="6" y="6" width="12" height="12" rx="2" /></Icon>
export const MenuIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M4 6h16M4 12h16M4 18h16" /></Icon>
export const CloseIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>
export const FileIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v5h5" /></Icon>
export const ChatIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></Icon>
export const ServicesIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><path d="M17.5 14v7M14 17.5h7" /></Icon>
export const CopyIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Icon>
export const RefreshIcon = (props: SVGProps<SVGSVGElement>) => <Icon {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 9A7 7 0 0 1 18 6l2 6M18 15a7 7 0 0 1-11.9 3L4 12" /></Icon>
