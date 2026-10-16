# 羽毛球手指發力（3D 生物力學教學）

給 F2–F5 學生的互動教學：左邊看**手指怎麼用力**（真實手骨、手肘與肌肉），右邊看**拍面和羽球怎麼反應**。5 個步驟：輕輕握拍、正手發力、反手大拇指推、網前轉拍、快速平抽。支援電腦與手機（直向自動上下分割）。

**線上觀看：** https://winglao.github.io/badminton-finger-biomechanics/

## 本機執行
```bash
python3 -m http.server 8790
# 開 http://localhost:8790/
```

## 資料出處
- Pan, Kao & Tsai（2024）. Journal of Physical Education and Sport, 24(9).
- Liu 等（2026）. Scientific Reports, 16:5055.
- 王可富、黃連興、廖悅茗（2008）. 師資培育與教師專業發展期刊, 1(2).
- Sakurai & Ohtsuki（2000）、Rossi 等（2010）：經 Pan 2024 文獻回顧引用。
- Badminton Insight、BWF Shuttle Time、安東羽球教練。

完整連結在網頁內「資料出處」。

## 第三方元件
- 骨骼、手肘與肌腱路徑：[MyoSim](https://github.com/MyoHub/myo_sim)（MyoHub，Apache-2.0，見 `assets/meshes/LICENSE_MyoSim_Apache-2.0.txt`）
- [three.js](https://threejs.org/)（MIT）、[p5.js](https://p5js.org/)（LGPL-2.1）
- 旁白以 [edge-tts](https://github.com/rany2/edge-tts) 生成（zh-TW-YunJheNeural）

畫面中的關節角度、肌肉用力、握壓分佈與速度比較為教學示意，不是實測數據。
