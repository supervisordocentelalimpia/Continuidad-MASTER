// src/App.jsx
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Search, Users, Clock, AlertTriangle, Download,
  CheckCircle, XCircle, Filter, Phone, Upload, FileText, RefreshCw, ChevronRight, Trash2
} from "lucide-react";

import { parseCevazPdf, __HORARIO_BLOQUES__ } from "./utils/parseCevazPdf";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

const isGraduated = (student) => (student?.levelNorm || "").toUpperCase() === "L19";

const DashboardContinuidad = () => {
  const [activeTab, setActiveTab] = useState("upload"); // 'upload' | 'dashboard'

  const [pdfOld, setPdfOld] = useState(null);
  const [pdfNew, setPdfNew] = useState(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [oldStudents, setOldStudents] = useState([]);
  const [newStudents, setNewStudents] = useState([]);
  const [dropouts, setDropouts] = useState([]);

  const [stats, setStats] = useState({
    totalOld: 0,
    totalNew: 0,
    eligibleOld: 0,
    reenrolled: 0,
    reenrolledPct: 0,
    lost: 0,
    lostPct: 0,
  });

  // Gestión
  const [contacted, setContacted] = useState(new Set());

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedLevel, setSelectedLevel] = useState("All");
  const [selectedHorario, setSelectedHorario] = useState("All");

  const resetAll = () => {
    setPdfOld(null);
    setPdfNew(null);
    setOldStudents([]);
    setNewStudents([]);
    setDropouts([]);
    setContacted(new Set());
    setSearchTerm("");
    setSelectedCategory("All");
    setSelectedLevel("All");
    setSelectedHorario("All");
    setStats({
      totalOld: 0, totalNew: 0, eligibleOld: 0,
      reenrolled: 0, reenrolledPct: 0, lost: 0, lostPct: 0
    });
    setErrorMsg("");
    setActiveTab("upload");
  };

  const processPdfs = async () => {
    setErrorMsg("");
    if (!pdfOld || !pdfNew) {
      setErrorMsg("Debes seleccionar el PDF ANTERIOR y el PDF ACTUAL.");
      return;
    }

    try {
      setLoading(true);

      const [oldList, newList] = await Promise.all([
        parseCevazPdf(pdfOld),
        parseCevazPdf(pdfNew),
      ]);

      if (!oldList.length || !newList.length) {
        throw new Error(
          `No se pudo extraer alumnos de uno de los PDFs. ` +
          `Old=${oldList.length}, New=${newList.length}. ` +
          `Posible PDF escaneado o formato distinto.`
        );
      }

      // Normalizar duplicados por cédula
      const uniqById = (arr) => {
        const map = new Map();
        for (const s of arr) {
          if (!s?.id) continue;
          if (!map.has(s.id)) map.set(s.id, s);
        }
        return Array.from(map.values());
      };

      const oldU = uniqById(oldList);
      const newU = uniqById(newList);

      const newIds = new Set(newU.map((s) => s.id));

      const eligibleOld = oldU.filter((s) => !isGraduated(s));
      const reenrolled = eligibleOld.filter((s) => newIds.has(s.id));
      const lost = eligibleOld.filter((s) => !newIds.has(s.id));

      const reenrolledPct = eligibleOld.length ? Math.round((reenrolled.length / eligibleOld.length) * 100) : 0;
      const lostPct = eligibleOld.length ? Math.round((lost.length / eligibleOld.length) * 100) : 0;

      setOldStudents(oldU);
      setNewStudents(newU);
      setDropouts(lost);
      setContacted(new Set());

      setStats({
        totalOld: oldU.length,
        totalNew: newU.length,
        eligibleOld: eligibleOld.length,
        reenrolled: reenrolled.length,
        reenrolledPct,
        lost: lost.length,
        lostPct,
      });

      setActiveTab("dashboard");
    } catch (e) {
      console.error(e);
      setErrorMsg(
        e?.message ||
        "No pude leer los PDFs. Si el PDF es escaneado (imagen), no se puede extraer texto."
      );
    } finally {
      setLoading(false);
    }
  };

  const toggleContact = (id) => {
    const next = new Set(contacted);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setContacted(next);
  };

  // Opciones dinámicas para filtros
  const filterOptions = useMemo(() => {
    const cats = Array.from(new Set(dropouts.map((s) => s.category).filter(Boolean))).sort();
    const lvls = Array.from(new Set(dropouts.map((s) => s.levelNorm).filter(Boolean))).sort();
    const hrs = Array.from(new Set(dropouts.map((s) => s.scheduleBlock).filter(Boolean)));

    const known = __HORARIO_BLOQUES__ || [];
    const knownSet = new Set(known);
    const ordered = [
      ...known.filter((h) => hrs.includes(h)),
      ...hrs.filter((h) => !knownSet.has(h)).sort(),
    ];

    return {
      categories: ["All", ...cats],
      levels: ["All", ...lvls],
      horarios: ["All", ...ordered],
    };
  }, [dropouts]);

  // Filtrado principal
  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return dropouts.filter((s) => {
      const matchesSearch =
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.id || "").includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").includes(q);

      const matchesCategory = selectedCategory === "All" || s.category === selectedCategory;
      const matchesLevel = selectedLevel === "All" || s.levelNorm === selectedLevel;
      const matchesHorario = selectedHorario === "All" || s.scheduleBlock === selectedHorario;

      return matchesSearch && matchesCategory && matchesLevel && matchesHorario;
    });
  }, [dropouts, searchTerm, selectedCategory, selectedLevel, selectedHorario]);

  // Métricas para gráficas
  const metrics = useMemo(() => {
    const total = dropouts.length;

    const byLevel = dropouts.reduce((acc, s) => {
      const k = s.levelNorm || "N/A";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const byHorario = dropouts.reduce((acc, s) => {
      const k = s.scheduleBlock || "N/A";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    const chartDataLevel = Object.keys(byLevel)
      .map((k) => ({ name: k, count: byLevel[k] }))
      .sort((a, b) => {
        const na = parseInt(a.name.replace(/\D/g, "")) || 0;
        const nb = parseInt(b.name.replace(/\D/g, "")) || 0;
        return na - nb;
      });

    const chartDataHorario = Object.keys(byHorario)
      .map((k) => ({ name: k, value: byHorario[k] }))
      .sort((a, b) => b.value - a.value);

    const topHorario = chartDataHorario[0]?.name || "N/A";

    return { total, chartDataLevel, chartDataHorario, topHorario };
  }, [dropouts]);

  const onClickLevelBar = (e) => {
    const label = e?.activeLabel;
    if (!label) return;
    setSelectedLevel(label);
  };

  const onClickPie = (data) => {
    const name = data?.name;
    if (!name) return;
    setSelectedHorario(name);
  };

  const exportExcel = () => {
    if (!filteredData.length) return;

    const rows = filteredData.map((s) => ({
      Estado: contacted.has(s.id) ? "Contactado" : "Pendiente",
      Cedula: s.id,
      Estudiante: s.name,
      Categoria: s.category,
      Nivel: s.levelNorm,
      Horario: s.scheduleBlock,
      Email: s.email || "",
      Telefono: s.phone || "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "No inscritos");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `continuidad_no_inscritos_${today}.xlsx`);
  };

  // ---------------- UPLOAD VIEW ----------------
  if (activeTab === "upload") {
    return (
      <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
        <header className="mb-6 pb-4 border-b border-slate-200">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-6 w-6 text-blue-600" />
            Continuidad - Cargar PDFs
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Los PDFs se procesan localmente en tu navegador. No se guardan.
          </p>
        </header>

        {errorMsg ? (
          <div className="mb-4 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {errorMsg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ANTERIOR
              </span>
              <button
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() => setPdfOld(null)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfOld(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            <div className="text-xs text-slate-500 mt-2">
              {pdfOld ? `Seleccionado: ${pdfOld.name}` : "No hay PDF seleccionado."}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold">
                Periodo ACTUAL
              </span>
              <button
                className="text-slate-500 hover:text-slate-700 text-sm inline-flex items-center gap-2"
                onClick={() => setPdfNew(null)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </div>

            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfNew(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
            <div className="text-xs text-slate-500 mt-2">
              {pdfNew ? `Seleccionado: ${pdfNew.name}` : "No hay PDF seleccionado."}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={processPdfs}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-3 rounded-xl font-bold shadow-lg inline-flex items-center gap-2"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Procesando..." : "Procesar y Comparar"}
          </button>

          <button
            onClick={resetAll}
            type="button"
            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold inline-flex items-center gap-2"
          >
            <Trash2 className="h-5 w-5" />
            Limpiar todo
          </button>
        </div>

        <p className="text-xs text-slate-500 mt-4">
          Nota: Si el PDF es escaneado (imagen), el sistema no podrá leer los alumnos.
        </p>
      </div>
    );
  }

  // ---------------- DASHBOARD VIEW ----------------
  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-8 w-8 text-blue-600" />
            Dashboard de Continuidad
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="bg-slate-100 px-2 py-0.5 rounded text-xs font-mono">
              Base (sin graduados): {stats.eligibleOld}
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">
              Reinscritos: {stats.reenrolledPct}%
            </span>
            <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-bold">
              Pérdida: {stats.lostPct}%
            </span>
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setActiveTab("upload")}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Upload className="h-4 w-4" />
            Cambiar PDFs
          </button>

          <button
            onClick={exportExcel}
            disabled={!filteredData.length}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg shadow"
          >
            <Download className="h-4 w-4" />
            Exportar Excel
          </button>

          <button
            onClick={resetAll}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
            Borrar
          </button>
        </div>
      </header>

      {/* METRICS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Reinscritos</p>
              <h3 className="text-4xl font-bold text-slate-800">{stats.reenrolled}</h3>
            </div>
            <CheckCircle className="h-10 w-10 text-emerald-100" />
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            {stats.reenrolledPct}% del total (sin graduados)
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Pérdida</p>
              <h3 className="text-4xl font-bold text-slate-800">{stats.lost}</h3>
            </div>
            <AlertTriangle className="h-10 w-10 text-red-100" />
          </div>
          <p className="text-xs text-red-600 mt-2 font-medium">
            {stats.lostPct}% del total (sin graduados)
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Acción Requerida</p>
              <h3 className="text-2xl font-bold text-slate-800">{metrics.total - contacted.size}</h3>
            </div>
            <Phone className="h-10 w-10 text-blue-100" />
          </div>
          <p className="text-xs text-slate-400 mt-2">Pendientes por contactar</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Horario con más fugas</p>
              <h3 className="text-lg font-bold text-slate-800 truncate">{metrics.topHorario}</h3>
            </div>
            <Clock className="h-10 w-10 text-indigo-100" />
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">Prioriza este bloque</p>
        </div>
      </div>

      {/* CHARTS */}
      {metrics.total > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-lg font-bold text-slate-800">Fugas por Nivel</h3>
              <div className="text-xs text-slate-500">
                Tip: haz click en una barra para filtrar la lista por ese nivel.
              </div>
            </div>

            <div className="h-64 w-full mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartDataLevel} onClick={onClickLevelBar}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
                  <YAxis />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Estudiantes" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Deserción por Horario</h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.chartDataHorario}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    onClick={onClickPie}
                  >
                    {metrics.chartDataHorario.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Tip: haz click en un segmento para filtrar por horario.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center mb-8">
          <div className="inline-flex bg-slate-100 p-4 rounded-full mb-4">
            <FileText className="h-8 w-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-medium text-slate-700">No hay datos para mostrar</h3>
          <p className="text-slate-500 mb-4">Carga los PDFs para comenzar.</p>
          <button onClick={() => setActiveTab("upload")} className="text-blue-600 font-semibold hover:underline">
            Ir a Cargar PDFs
          </button>
        </div>
      )}

      {/* CRM TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <h3 className="text-lg font-bold text-slate-800">Lista de Gestión</h3>
            <div className="text-xs text-slate-500">
              Mostrando {filteredData.length} de {metrics.total}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.categories.map((c) => (
                  <option key={c} value={c}>{c === "All" ? "Todas las categorías" : c}</option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.levels.map((l) => (
                  <option key={l} value={l}>{l === "All" ? "Todos los niveles" : l}</option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <select
                value={selectedHorario}
                onChange={(e) => setSelectedHorario(e.target.value)}
                className="appearance-none bg-slate-50 border border-slate-200 text-slate-700 py-2 pl-4 pr-8 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {filterOptions.horarios.map((h) => (
                  <option key={h} value={h}>{h === "All" ? "Todos los horarios" : h}</option>
                ))}
              </select>
              <Filter className="absolute right-3 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar (nombre, cédula, email, teléfono)…"
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold border-b border-slate-100">Estado</th>
                <th className="p-4 font-semibold border-b border-slate-100">Estudiante</th>
                <th className="p-4 font-semibold border-b border-slate-100">Cédula</th>
                <th className="p-4 font-semibold border-b border-slate-100">Categoría</th>
                <th className="p-4 font-semibold border-b border-slate-100">Nivel</th>
                <th className="p-4 font-semibold border-b border-slate-100">Horario</th>
                <th className="p-4 font-semibold border-b border-slate-100">Email</th>
                <th className="p-4 font-semibold border-b border-slate-100">Teléfono</th>
                <th className="p-4 font-semibold border-b border-slate-100 text-right">Acción</th>
              </tr>
            </thead>

            <tbody className="text-sm text-slate-700 divide-y divide-slate-50">
              {filteredData.length ? (
                filteredData.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      contacted.has(s.id) ? "bg-emerald-50/30" : ""
                    }`}
                  >
                    <td className="p-4">
                      {contacted.has(s.id) ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3" />
                          Contactado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <XCircle className="h-3 w-3" />
                          Pendiente
                        </span>
                      )}
                    </td>

                    <td className="p-4 font-medium text-slate-900">{s.name}</td>
                    <td className="p-4 font-mono text-xs">{s.id}</td>
                    <td className="p-4">{s.category}</td>

                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">
                        {s.levelNorm}
                      </span>
                    </td>

                    <td className="p-4 text-slate-600">{s.scheduleBlock}</td>

                    <td className="p-4 text-slate-600">
                      {s.email ? (
                        <a className="text-blue-600 hover:underline" href={`mailto:${s.email}`}>
                          {s.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>

                    <td className="p-4 text-slate-600">
                      {s.phone ? (
                        <a className="text-blue-600 hover:underline" href={`tel:${s.phone}`}>
                          {s.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400">N/A</span>
                      )}
                    </td>

                    <td className="p-4 text-right">
                      <button
                        onClick={() => toggleContact(s.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          contacted.has(s.id)
                            ? "bg-slate-200 text-slate-500 hover:bg-slate-300"
                            : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                        }`}
                        title={contacted.has(s.id) ? "Marcar como pendiente" : "Marcar como contactado"}
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="p-8 text-center text-slate-400">
                    No se encontraron estudiantes con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>Continuidad</span>
          <span>{new Date().getFullYear()}</span>
        </div>
      </div>
    </div>
  );
};

export default DashboardContinuidad;
