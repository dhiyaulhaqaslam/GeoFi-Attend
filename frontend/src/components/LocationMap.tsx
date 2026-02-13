import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap } from "react-leaflet";
import L from "leaflet";

type BestLoc = { lat: number; lng: number; accuracy: number; timestamp: number };

type Props = {
    office: {
        name: string;
        latitude: number;
        longitude: number;
        radius_meters: number;
        address?: string;
    } | null;
    userLoc: BestLoc | null;
};

function toRad(v: number) {
    return (v * Math.PI) / 180;
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
    const map = useMap();
    useEffect(() => {
        if (!points.length) return;
        const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
        map.fitBounds(bounds.pad(0.25), { animate: true });
    }, [map, points]);
    return null;
}

// Fix icon Leaflet (biar marker muncul di bundler React)
const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export default function LocationMap({ office, userLoc }: Props) {
    const officePoint = useMemo<[number, number] | null>(() => {
        if (!office) return null;
        return [office.latitude, office.longitude];
    }, [office]);

    const userPoint = useMemo<[number, number] | null>(() => {
        if (!userLoc) return null;
        return [userLoc.lat, userLoc.lng];
    }, [userLoc]);

    const points = useMemo(() => {
        const arr: Array<[number, number]> = [];
        if (officePoint) arr.push(officePoint);
        if (userPoint) arr.push(userPoint);
        return arr;
    }, [officePoint, userPoint]);

    const distance = useMemo(() => {
        if (!officePoint || !userPoint) return null;
        return distanceMeters(userPoint[0], userPoint[1], officePoint[0], officePoint[1]);
    }, [officePoint, userPoint]);

    // Default center: kantor kalau ada, else Makassar-ish
    const center = useMemo<[number, number]>(() => {
        if (officePoint) return officePoint;
        return [-5.17, 119.43];
    }, [officePoint]);

    // render map juga walau userLoc null (biar bisa lihat titik kantor)
    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 8, fontSize: 14 }}>
                <strong>Preview Lokasi</strong>
                <div style={{ opacity: 0.85, marginTop: 4 }}>
                    {office ? (
                        <>
                            Kantor: <strong>{office.name}</strong> • Radius: <strong>{office.radius_meters}m</strong>
                            {typeof distance === "number" && (
                                <>
                                    {" "}
                                    • Jarak Anda: <strong>{Math.round(distance)}m</strong>
                                </>
                            )}
                            {userLoc && (
                                <>
                                    {" "}
                                    • Akurasi GPS: <strong>{Math.round(userLoc.accuracy)}m</strong>
                                </>
                            )}
                        </>
                    ) : (
                        <>Pilih kantor untuk melihat radius.</>
                    )}
                </div>
            </div>

            <div style={{ height: 320, width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                <MapContainer center={center} zoom={17} style={{ height: "100%", width: "100%" }}>
                    <TileLayer
                        attribution='&copy; OpenStreetMap'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {points.length > 0 && <FitBounds points={points} />}

                    {officePoint && office && (
                        <>
                            <Marker position={officePoint}>
                                <Popup>
                                    <div style={{ fontSize: 13 }}>
                                        <div><strong>{office.name}</strong></div>
                                        <div>{office.address ?? "-"}</div>
                                        <div>Radius: {office.radius_meters} m</div>
                                    </div>
                                </Popup>
                            </Marker>

                            <Circle
                                center={officePoint}
                                radius={office.radius_meters}
                                pathOptions={{ weight: 2 }}
                            />
                        </>
                    )}

                    {userPoint && userLoc && (
                        <>
                            <Marker position={userPoint}>
                                <Popup>
                                    <div style={{ fontSize: 13 }}>
                                        <div><strong>Lokasi Anda</strong></div>
                                        <div>Lat: {userLoc.lat}</div>
                                        <div>Lng: {userLoc.lng}</div>
                                        <div>Akurasi: {Math.round(userLoc.accuracy)} m</div>
                                    </div>
                                </Popup>
                            </Marker>

                            {/* Circle akurasi GPS user (estimasi) */}
                            <Circle
                                center={userPoint}
                                radius={Math.max(5, userLoc.accuracy)}
                                pathOptions={{ weight: 1, dashArray: "4 6" }}
                            />
                        </>
                    )}

                    {officePoint && userPoint && (
                        <Polyline positions={[userPoint, officePoint]} pathOptions={{ weight: 3 }} />
                    )}
                </MapContainer>
            </div>
        </div>
    );
}
