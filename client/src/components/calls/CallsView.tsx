import React from 'react';
import { Icon } from '../../icons';

export function CallsView() {
    return (
        <section className="placeholder-view">
            <div className="placeholder-icon">{Icon.phone(56)}</div>
            <h2>Голосовые звонки</h2>
            <p>Откройте чат и нажмите кнопку звонка, чтобы начать зашифрованный разговор</p>
            <div className="placeholder-pills">
                <span className="pill">{Icon.shield(14)} End-to-end</span>
                <span className="pill">{Icon.mic(14)} Opus HD</span>
                <span className="pill">{Icon.lock(14)} WebRTC P2P</span>
            </div>
            <div className="calls-info">
                <div className="calls-info-item">
                    <span className="calls-info-icon">{Icon.check(16)}</span>
                    <span>Аудио идёт напрямую между устройствами</span>
                </div>
                <div className="calls-info-item">
                    <span className="calls-info-icon">{Icon.check(16)}</span>
                    <span>Сигнализация шифруется ключом чата</span>
                </div>
                <div className="calls-info-item">
                    <span className="calls-info-icon">{Icon.check(16)}</span>
                    <span>Сервер не видит и не слышит содержимое</span>
                </div>
            </div>
        </section>
    );
}