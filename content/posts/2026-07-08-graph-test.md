---
title: 인터랙티브 함수 그래프 테스트
date: '2026-07-08'
tags:
  - d3
  - graph
  - test
summary: graph 코드 펜스(TOML 스펙)로 렌더되는 D3 기반 함수 그래프와 파라미터 슬라이더 동작 확인.
category: Dev
---

# 감쇠 사인파

슬라이더로 진폭(`a`)·진동수(`b`)·감쇠(`d`)를 조절하면 곡선이 실시간으로 갱신된다.
그래프 위에 포인터를 올리면 해당 지점의 함숫값을 읽을 수 있다.

```graph
fn = "a * exp(-d * x) * sin(b * x)"
domain = [0, 20]
display.x = true
display.fx = true

[params]
a = { default = 1, min = 0.2, max = 3, step = 0.1 }
b = { default = 2, min = 0.5, max = 8, step = 0.1 }
d = { default = 0.2, min = 0, max = 1, step = 0.02 }
```

# 점근선이 있는 함수

특이점 부근에서 값이 발산하는 함수는 `range`로 y 표시 범위를 고정하는 것을 권장한다.
비유한값 구간은 선이 끊겨 세로 스파이크 없이 표시된다.

```graph
fn = "1 / (x - c)"
domain = [-5, 5]
range = [-10, 10]
display.x = true
display.fx = true

[params]
c = { default = 0, min = -3, max = 3, step = 0.1 }
```

# 삼차함수의 적분

`integral = [0, "t"]` — 슬라이더로 적분 상한 `t`를 움직이면 음영 영역(곡선과 y=0 사이)과
수치 적분값이 함께 변한다. 경계는 숫자 또는 문자열로 감싼 param 식을 쓸 수 있다.

```graph
fn = "(x + 2) * x * (x - 2) / 4"
domain = [-4, 4]
range = [-6, 6]
integral = [0, "t"]
display.x = true
display.fx = true
display.integral = true
display.graph.integral = true

[params]
t = { default = 1, min = -3, max = 3, step = 0.05 }
```

# 파라미터 없는 그래프

`[params]`가 없으면 슬라이더 없이 정적 곡선만 표시된다. `domain`을 생략하면 `[-10, 10]`.
`display.*`는 **기본이 전부 false** — 이 그래프처럼 아무것도 지정하지 않으면
readout·호버 요소 없이 곡선만 그려진다.

```graph
fn = "x^2 * sin(x) / 10"
```

# 단위원의 각도와 sin·cos

1번 칸의 단위원 위 반지름이 각도 `t`(도)를 따라 회전한다. 반지름 끝점의
y좌표·x좌표가 곧 2·3번 칸의 sin·cos 곡선 값이며(점선 사영으로 표시),
세 구역이 공통 param `t`에 동기화된다. 2·3번 칸의 `point = "t"` +
`display.graph.point`는 **param 추적점** — 슬라이더를 움직이면 곡선 위의
링 마커가 x = t 지점을 따라가고, `f(x)` readout이 그 값을 추적한다(호버 중에는
호버 지점이 우선). 파형 위 음영은 `0 → t` 구간의 각도 진행.
x축과 param은 도(°) 단위 — 식에서 `x * pi / 180`으로 변환한다.
`[[plot]]`이 3개이므로 2×2 배치의 넷째 칸은 빈 칸으로 남는다.

```graph
domain = [0, 360]
range = [-1.2, 1.2]

[params]
t = { default = 45, min = 0, max = 360, step = 1 }

[[plot]]
kind = "circle"
title = "단위원 — 반지름의 회전 (θ = t°)"
angle = "t * pi / 180"
display.theta = true
display.cos = true
display.sin = true

[[plot]]
title = "sin(x°) — 단위원의 y좌표"
fn = "sin(x * pi / 180)"
integral = [0, "t"]
point = "t"
display.fx = true
display.graph.integral = true
display.graph.point = true

[[plot]]
title = "cos(x°) — 단위원의 x좌표"
fn = "cos(x * pi / 180)"
integral = [0, "t"]
point = "t"
display.fx = true
display.graph.integral = true
display.graph.point = true
```
