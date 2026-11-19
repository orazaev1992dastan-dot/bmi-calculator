"use strict";

// Чистые функции отдельно от интерфейса: их можно проверить в Node.js.
function parseMeasurement(value, name, min, max, unit) {
  const text = String(value).trim();
  if (!text) throw new Error(`Введите ${name}.`);
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) {
    throw new Error("Введите число, например 65 или 65,5.");
  }
  const number = Number(text.replace(",", "."));
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name === "рост" ? "Рост" : "Вес"} должен быть от ${min} до ${max} ${unit}.`);
  }
  return number;
}

function calculateBMI(height, weight) {
  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) {
    throw new Error("Рост и вес должны быть положительными числами.");
  }
  return weight / ((height / 100) ** 2);
}

function classifyBMI(bmi) {
  if (!Number.isFinite(bmi) || bmi <= 0) throw new Error("Некорректный ИМТ.");
  // Категория определяется до округления результата на экране.
  if (bmi < 18.5) return { key: "underweight", title: "Недостаточная масса тела", color: "#3778ae", description: "ИМТ ниже стандартного диапазона для взрослых. Обсудите результат с врачом, особенно при непреднамеренном снижении веса." };
  if (bmi < 25) return { key: "normal", title: "Нормальная масса тела", color: "#087f78", description: "Ваш ИМТ находится в стандартном диапазоне для взрослых. Это один из ориентиров; он не даёт полной оценки здоровья." };
  if (bmi < 30) return { key: "overweight", title: "Избыточная масса тела", color: "#94630b", description: "ИМТ выше стандартного диапазона для взрослых. Врач поможет оценить состав тела и другие показатели здоровья." };
  return { key: "obesity", title: "Ожирение по критерию ИМТ", color: "#b75046", description: "ИМТ составляет 30 или выше. Обсудите результат с врачом для индивидуальной оценки здоровья и дальнейших шагов." };
}

function markerPosition(bmi) {
  return Math.max(0, Math.min(100, (bmi - 16) / 24 * 100));
}

if (typeof document !== "undefined") {
  const form = document.getElementById("bmi-form");
  const result = document.getElementById("result");
  const initialResult = result.innerHTML;
  const marker = document.getElementById("scale-marker");
  const fields = [
    { id: "height", name: "рост", min: 100, max: 250, unit: "см" },
    { id: "weight", name: "вес", min: 20, max: 500, unit: "кг" }
  ];

  function clearResult() {
    result.innerHTML = initialResult;
    delete result.dataset.category;
    marker.hidden = true;
    document.querySelectorAll(".legend li").forEach(row => row.classList.remove("active"));
  }

  function clearError(id) {
    document.getElementById(id).removeAttribute("aria-invalid");
    const error = document.getElementById(`${id}-error`);
    error.hidden = true;
    error.textContent = "";
  }

  fields.forEach(({ id }) => {
    document.getElementById(id).addEventListener("input", () => {
      clearError(id);
      clearResult(); // Изменённые параметры не должны оставлять устаревший результат.
    });
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    const values = {};
    let firstInvalid = null;
    fields.forEach(({ id, name, min, max, unit }) => {
      clearError(id);
      const input = document.getElementById(id);
      try {
        values[id] = parseMeasurement(input.value, name, min, max, unit);
      } catch (error) {
        input.setAttribute("aria-invalid", "true");
        const message = document.getElementById(`${id}-error`);
        message.textContent = error.message;
        message.hidden = false;
        firstInvalid ??= input;
      }
    });
    if (firstInvalid) {
      clearResult();
      firstInvalid.focus();
      return;
    }
    const bmi = calculateBMI(values.height, values.weight);
    const category = classifyBMI(bmi);
    result.dataset.category = category.key;
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      result.animate?.([{ opacity: 0.4, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 320, easing: "ease-out" });
    }
    const number = document.getElementById("bmi-value");
    number.replaceChildren(document.createTextNode(bmi.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    const unit = document.createElement("span");
    unit.className = "value-unit";
    unit.textContent = "кг/м²";
    number.append(unit);
    const badge = document.getElementById("category");
    badge.textContent = category.title;
    document.getElementById("result-description").textContent = category.description + " Категория определена по точному значению, до округления.";
    marker.style.left = `${markerPosition(bmi)}%`;
    marker.hidden = false;
    document.querySelectorAll(".legend li").forEach(row => row.classList.toggle("active", row.dataset.category === category.key));
    document.dispatchEvent(new CustomEvent("bmi-calculated", { detail: { height: values.height, weight: values.weight } }));
  });

  form.addEventListener("reset", () => {
    fields.forEach(({ id }) => clearError(id));
    clearResult();
    document.getElementById("height").focus();
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseMeasurement, calculateBMI, classifyBMI, markerPosition };
}
