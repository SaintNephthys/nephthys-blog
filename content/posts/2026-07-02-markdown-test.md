---
title: 수식·코드 렌더링 테스트
date: 2026-07-02
tags: [math, code, test]
category: Dev
summary: KaTeX 수식, 코드 하이라이팅, 표 렌더링을 검증하는 게시물.
---

# 수식 (KaTeX)

인라인 수식은 $E = mc^2$ 처럼 문장 안에 쓸 수 있다.
블록 수식은 별도 패널로 표시된다.

맥스웰 방정식:

$$
\begin{aligned}
\nabla \cdot \mathbf{E} &= \frac{\rho}{\varepsilon_0} \\
\nabla \cdot \mathbf{B} &= 0 \\
\nabla \times \mathbf{E} &= -\frac{\partial \mathbf{B}}{\partial t} \\
\nabla \times \mathbf{B} &= \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
\end{aligned}
$$

시간에 무관한 슈뢰딩거 방정식:

$$
-\frac{\hbar^2}{2m}\frac{d^2\psi}{dx^2} + V(x)\psi = E\psi
$$

# 코드 하이라이팅

TypeScript:

```typescript
interface Vector3 {
  x: number
  y: number
  z: number
}

function normalize(v: Vector3): Vector3 {
  const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2)
  if (len === 0) throw new Error('zero-length vector')
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}
```

Python:

```python
import numpy as np

def runge_kutta_4(f, y0, t):
    """4차 룽게-쿠타 방법으로 ODE를 적분한다."""
    y = np.zeros((len(t), len(y0)))
    y[0] = y0
    for i in range(len(t) - 1):
        h = t[i + 1] - t[i]
        k1 = f(y[i], t[i])
        k2 = f(y[i] + h * k1 / 2, t[i] + h / 2)
        k3 = f(y[i] + h * k2 / 2, t[i] + h / 2)
        k4 = f(y[i] + h * k3, t[i] + h)
        y[i + 1] = y[i] + h * (k1 + 2 * k2 + 2 * k3 + k4) / 6
    return y
```

인라인 코드: `const answer = 42`

# 표

| 상수 | 기호 | 값 |
| --- | --- | --- |
| 광속 | $c$ | $2.998 \times 10^8 \ \mathrm{m/s}$ |
| 플랑크 상수 | $h$ | $6.626 \times 10^{-34} \ \mathrm{J \cdot s}$ |
| 중력 상수 | $G$ | $6.674 \times 10^{-11} \ \mathrm{m^3 kg^{-1} s^{-2}}$ |

# 인용과 구분선

> "사막에서 살아남는 건 힘들었을 거야. 인간은 왜 이렇게 밀집된 곳에 모여 살았을까?"

---

이 게시물이 올바르게 보이면 Markdown 파이프라인이 정상 동작하는 것이다.
