"use client";

import type { Page } from "@crossexam/contracts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ResponseChart({
  pages,
  source = "fixture",
}: {
  pages: Page[];
  source?: "fixture" | "live";
}) {
  return (
    <div
      className="response-chart"
      role="img"
      aria-label={`${source === "live" ? "Live fetch durations" : "Fixture response times"}: ${pages
        .slice(0, 6)
        .map((page) => `${page.path}: ${page.durationMs} milliseconds`)
        .join(", ")}`}
    >
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        initialDimension={{ width: 500, height: 220 }}
      >
        <BarChart
          data={pages.slice(0, 6)}
          margin={{ top: 12, left: -23, right: 8, bottom: 18 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} stroke="#d7dce0" strokeDasharray="3 5" />
          <XAxis
            dataKey="path"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#606b77", fontSize: 11 }}
            tickMargin={10}
            angle={-20}
            textAnchor="end"
            height={40}
            interval={0}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#606b77", fontSize: 11 }}
            ticks={source === "fixture" ? [0, 200, 400, 600, 800] : undefined}
            domain={source === "fixture" ? [0, 800] : [0, "auto"]}
          />
          <Tooltip
            cursor={{ fill: "#ffffff05" }}
            contentStyle={{
              background: "#fffefa",
              border: "1px solid #cbd2da",
              borderRadius: 6,
              color: "#25292e",
              fontSize: 12,
            }}
            formatter={(value) => [`${value} ms`, "Response"]}
          />
          <Bar dataKey="durationMs" radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={false}>
            {pages.slice(0, 6).map((page) => (
              <Cell key={page.id} fill={page.durationMs > 500 ? "#ad7b31" : "#6d87b3"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
