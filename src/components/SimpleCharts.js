import { View } from 'react-native';
import Svg, { G, Line, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import theme from '../theme';

const PAD = { bottom: 28, left: 36, right: 12, top: 12 };

/** Vertical bars: data [{ label, value }] */
export function VerticalBarChart({
  barColor = theme.primary,
  data,
  height = 200,
  width = 320,
}) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = data.length ? innerW / data.length : innerW;
  const barW = slot * 0.62;
  const gap = slot * 0.38;

  return (
    <View style={{ height, width }}>
      <Svg height={height} width={width}>
        {data.map((d, i) => {
          const x = PAD.left + i * slot + gap / 2;
          const h = (d.value / max) * innerH;
          const y = PAD.top + innerH - h;
          return (
            <G key={`${d.label}-${i}`}>
              <Rect fill={barColor} height={h} rx={4} width={barW} x={x} y={y} />
              <SvgText
                fill={theme.muted}
                fontSize={9}
                x={x + barW / 2}
                y={height - 8}
                textAnchor="middle"
              >
                {String(d.label)}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** Line chart: data [{ x, y }] */
export function LineTrendChart({ color = theme.primary, data, height = 180, width = 320 }) {
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  if (data.length === 0) {
    return <View style={{ height, width }} />;
  }
  const ys = data.map((d) => d.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys, minY + 0.01);
  const n = Math.max(1, data.length - 1);
  const points = data
    .map((d, i) => {
      const px = PAD.left + (data.length === 1 ? innerW / 2 : (i / n) * innerW);
      const py =
        PAD.top + innerH - ((d.y - minY) / (maxY - minY)) * innerH;
      return `${px},${py}`;
    })
    .join(' ');

  return (
    <View style={{ height, width }}>
      <Svg height={height} width={width}>
        <Line
          stroke={theme.border}
          strokeWidth={1}
          x1={PAD.left}
          x2={PAD.left + innerW}
          y1={PAD.top + innerH}
          y2={PAD.top + innerH}
        />
        {data.length > 1 ? (
          <Polyline
            fill="none"
            points={points}
            stroke={color}
            strokeLinejoin="round"
            strokeWidth={2}
          />
        ) : (
          <Rect
            fill={color}
            height={6}
            rx={3}
            width={6}
            x={PAD.left + innerW / 2 - 3}
            y={PAD.top + innerH / 2 - 3}
          />
        )}
        {data.map((d, i) => {
          const px = PAD.left + (data.length === 1 ? innerW / 2 : (i / n) * innerW);
          return (
            <SvgText
              key={`${d.x}-${i}`}
              fill={theme.muted}
              fontSize={9}
              textAnchor="middle"
              x={px}
              y={height - 6}
            >
              {String(d.x)}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}
