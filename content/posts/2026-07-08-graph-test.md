---
title: 인터랙티브 함수 그래프 테스트
date: 2026-07-08
category: Dev
tags: [d3, graph, test]
summary: graph 코드 펜스(TOML 스펙)로 렌더되는 D3 기반 함수 그래프와 파라미터 슬라이더 동작 확인.
draft: false
---

# 감쇠 사인파

슬라이더로 진폭(`a`)·진동수(`b`)·감쇠(`d`)를 조절하면 곡선이 실시간으로 갱신된다.
그래프 위에 포인터를 올리면 해당 지점의 함숫값을 읽을 수 있다.

```graph
fn = "a * exp(-d * x) * sin(b * x)"
domain = [0, 20]

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

[params]
t = { default = 1, min = -3, max = 3, step = 0.05 }
```

# 파라미터 없는 그래프

`[params]`가 없으면 슬라이더 없이 정적 곡선만 표시된다. `domain`을 생략하면 `[-10, 10]`.

```graph
fn = "x^2 * sin(x) / 10"
```
