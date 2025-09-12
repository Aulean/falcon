"use client"

import * as React from "react"
import {
  BookOpen,
  Feather,
  Settings2,
  Users,
  Shield,
  Key,
  CreditCard,
  FileText,
  MessageSquare,
  BriefcaseBusiness,
} from "lucide-react"

import { Link } from "@tanstack/react-router"
import { NavMain } from "@/components/nav-main"
import { NavAdmin } from "@/components/nav-admin"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const SHOW_ADMIN = false

const data = {
  user: {
    name: "Carlos",
    email: "carlos@falcon.com",
    avatar: "/avatars/shadcn.jpg",
  },
  // Platform section
  navMain: [
    {
      title: "Chat",
      url: "/",
      icon: MessageSquare,
      isActive: true,
    },
    {
      title: "Cases",
      url: "/cases",
      icon: BriefcaseBusiness,
    },
    {
      title: "Documentation",
      url: "/docs",
      icon: BookOpen,
    },
  ],
  // Admin section
  navAdmin: [
    {
      title: "Users",
      url: "#",
      icon: Users,
    },
    {
      title: "Access Control",
      url: "#",
      icon: Shield,
    },
    {
      title: "API Keys",
      url: "#",
      icon: Key,
    },
    {
      title: "Billing",
      url: "#",
      icon: CreditCard,
    },
    {
      title: "Audit Logs",
      url: "#",
      icon: FileText,
    },
    {
      title: "Settings",
      url: "#",
      icon: Settings2,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" search={(prev) => ({ sid: prev?.sid || '' })}>
                <div className="bg-white flex aspect-square size-8 items-center justify-center rounded-lg">
<Feather className="size-4 text-teal-700" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Lawyer Up</span>
                  <span className="truncate text-xs">Enterprise</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        {SHOW_ADMIN ? <NavAdmin items={data.navAdmin} /> : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
